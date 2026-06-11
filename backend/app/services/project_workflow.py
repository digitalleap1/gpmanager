"""Simple per-project workflow checklist.

The team lead picks ONE person per stage (Website Review / Content Writing /
Payment). Each assignment spawns (or reassigns) a Task for that person — which
shows up in their Task page — and notifies them + the admins. A stage is "done"
when its task is completed; when all three are done the project workflow is
complete. (Task create/complete already notify admins, so the admin sees every
step.)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequest, NotFound, PermissionDenied
from app.core.permissions import is_manager
from app.core.scope import accessible_project_ids
from app.models.project import Project, ProjectMember, ProjectWorkflowStage
from app.models.task import Task
from app.models.user import User
from app.services.activity import ActivityLogger
from app.services.notification import Notifier

# Ordered stages of the simple checklist.
STAGES: list[tuple[str, str]] = [
    ("website_review", "Website Review"),
    ("content_writing", "Content Writing"),
    ("payment", "Payment"),
]
STAGE_LABELS = dict(STAGES)
STAGE_KEYS = [k for k, _ in STAGES]


class ProjectWorkflowService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.company_id = user.company_id
        self.activity = ActivityLogger(db)
        self.notifier = Notifier(db)

    def _project(self, project_id: uuid.UUID) -> Project:
        p = self.db.get(Project, project_id)
        if p is None or p.company_id != self.company_id or p.deleted_at is not None:
            raise NotFound("Project not found")
        pids = accessible_project_ids(self.db, self.user)
        if pids is not None and p.id not in pids:
            raise NotFound("Project not found")
        return p

    def _stages_map(self, project_id: uuid.UUID) -> dict[str, ProjectWorkflowStage]:
        rows = self.db.scalars(
            select(ProjectWorkflowStage).where(
                ProjectWorkflowStage.project_id == project_id
            )
        ).all()
        return {r.stage_key: r for r in rows}

    def _audience(self, project: Project) -> set[uuid.UUID]:
        """Everyone involved in a project: members + team lead + assignee + creator."""
        member_ids = set(
            self.db.scalars(
                select(ProjectMember.user_id).where(ProjectMember.project_id == project.id)
            ).all()
        )
        member_ids |= {project.team_lead_id, project.assignee_id, project.created_by}
        return {u for u in member_ids if u}

    def _broadcast(
        self, project: Project, *, type: str, title: str, body: str,
        entity_type: str, entity_id: uuid.UUID,
    ) -> None:
        """Notify the whole project audience (members + lead + assignee + creator)
        plus all admins — everyone hears about every step."""
        for uid in self._audience(project) - {self.user.id}:
            self.notifier.notify(
                company_id=self.company_id, user_id=uid, type=type, title=title,
                body=body, entity_type=entity_type, entity_id=entity_id,
            )
        self.notifier.notify_admins(
            company_id=self.company_id, type=type, title=title, body=body,
            entity_type=entity_type, entity_id=entity_id, exclude=self.user.id,
        )

    def checklist(self, project_id: uuid.UUID) -> dict:
        p = self._project(project_id)
        existing = self._stages_map(p.id)
        task_ids = [s.task_id for s in existing.values() if s.task_id]
        tasks = (
            {t.id: t for t in self.db.scalars(select(Task).where(Task.id.in_(task_ids))).all()}
            if task_ids
            else {}
        )
        stages = []
        done_count = 0
        for key, label in STAGES:
            s = existing.get(key)
            task = tasks.get(s.task_id) if s and s.task_id else None
            task_status = task.status if task else None
            done = task_status == "completed"
            if done:
                done_count += 1
            stages.append(
                {
                    "stage_key": key,
                    "label": label,
                    "assignee": (
                        {"id": s.assignee.id, "full_name": s.assignee.full_name}
                        if s and s.assignee
                        else None
                    ),
                    "task_id": s.task_id if s else None,
                    "task_status": task_status,
                    "done": done,
                }
            )
        return {
            "project_id": p.id,
            "project_name": p.name,
            "stages": stages,
            "all_done": done_count == len(STAGES),
            "completed_count": done_count,
            "total": len(STAGES),
        }

    def assign(
        self, project_id: uuid.UUID, stage_key: str, assignee_id: uuid.UUID | None
    ) -> dict:
        if not is_manager(self.user):
            raise PermissionDenied("Only team leads and admins manage the workflow")
        if stage_key not in STAGE_LABELS:
            raise BadRequest(f"stage_key must be one of {STAGE_KEYS}")
        p = self._project(project_id)
        label = STAGE_LABELS[stage_key]

        stage = self.db.scalar(
            select(ProjectWorkflowStage).where(
                ProjectWorkflowStage.project_id == p.id,
                ProjectWorkflowStage.stage_key == stage_key,
            )
        )
        if stage is None:
            stage = ProjectWorkflowStage(project_id=p.id, stage_key=stage_key)
            self.db.add(stage)
        stage.assignee_id = assignee_id

        task = self.db.get(Task, stage.task_id) if stage.task_id else None
        if assignee_id:
            if task is None:
                task = Task(
                    company_id=self.company_id,
                    project_id=p.id,
                    name=f"{label}: {p.name}",
                    description=f"Workflow stage '{label}' for project '{p.name}'.",
                    assigned_to=assignee_id,
                    status="pending",
                    created_by=self.user.id,
                )
                self.db.add(task)
                self.db.flush()
                stage.task_id = task.id
            else:
                task.assigned_to = assignee_id
                task.status = "pending"
                task.completed_at = None
            # The assignee gets a task-specific ping...
            if assignee_id != self.user.id:
                self.notifier.notify(
                    company_id=self.company_id,
                    user_id=assignee_id,
                    type="workflow_stage_assigned",
                    title=f"{label} assigned to you",
                    body=f"You were assigned '{label}' on the project '{p.name}'.",
                    entity_type="task",
                    entity_id=task.id,
                )
            # ...and EVERYONE on the project (members + lead + assignee + admins)
            # is kept informed of the step.
            assignee = self.db.get(User, assignee_id)
            assignee_name = assignee.full_name if assignee else "someone"
            self._broadcast(
                p, type="workflow_stage_assigned", title=f"{label} assigned",
                body=f"{self.user.full_name} assigned '{label}' to {assignee_name} on '{p.name}'.",
                entity_type="project", entity_id=p.id,
            )
        elif task is not None:
            # Cleared the assignee — unassign the task.
            task.assigned_to = None

        self.activity.record(
            company_id=self.company_id,
            user_id=self.user.id,
            action="workflow.stage_assigned",
            module="project",
            entity_type="project",
            entity_id=p.id,
            new={"name": p.name, "stage": stage_key, "assignee": str(assignee_id) if assignee_id else None},
        )
        stage.updated_at = datetime.now(UTC)
        self.db.commit()
        return self.checklist(project_id)
