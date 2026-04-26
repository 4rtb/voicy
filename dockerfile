FROM node:18

# 🔥 ставим ffmpeg + ffprobe
RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install

COPY . .

RUN yarn build-ts

CMD ["node", "dist/app.js"]