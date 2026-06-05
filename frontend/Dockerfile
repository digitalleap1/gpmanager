# Development Dockerfile (compose runs `npm run dev` with hot reload).
# A multi-stage production build is added during deployment hardening.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
