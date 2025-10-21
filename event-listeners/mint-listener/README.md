for development:
    npm run dev

for deployment:
    install node 20
    create .env file
    npm install
    npm run build
    docker compose up --build --force-recreate OR docker compose up -d
