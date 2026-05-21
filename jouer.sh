#!/bin/bash

echo "🚀 Préparation de Warfront Saliège pour tes amis..."

# 1. Lancement du tunnel Ngrok en arrière-plan sur le port du serveur
ngrok http 2567 > /dev/null &
sleep 3

# 2. Récupération de l'adresse publique
PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*')

echo "-------------------------------------------------------"
echo "✅ TON SERVEUR EST PRÊT !"
echo "Lien à envoyer à tes amis : $PUBLIC_URL"
echo "-------------------------------------------------------"

# 3. Mise à jour automatique de l'URL dans ton client
echo "VITE_SERVER_URL=$PUBLIC_URL" > ./client/.env

# 4. Lancement du serveur et du client
osascript -e 'tell application "Terminal" to do script "cd '$(pwd)'/server && npm run dev"'
osascript -e 'tell application "Terminal" to do script "cd '$(pwd)'/client && npm run dev"'

echo "🎮 Le jeu va s'ouvrir localement. Tes amis peuvent se connecter avec le lien ci-dessus."
