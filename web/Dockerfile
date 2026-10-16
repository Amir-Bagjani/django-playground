FROM node:22-alpine

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN mkdir -p public/monaco && cp -r node_modules/monaco-editor/min/vs public/monaco/vs
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
