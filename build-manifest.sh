#!/bin/bash

# Se placer dans le dossier du script
cd "$(dirname "$0")"

# Exécuter le script Python
python3 build_manifest.py

echo ""
read -p "Appuyez sur Entrée pour fermer..."