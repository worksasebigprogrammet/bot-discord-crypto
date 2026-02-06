# Crypto Tracker Bot

Bot Discord professionnel pour tracker les prix de cryptomonnaies en temps reel avec systeme d'alertes, embeds dynamiques et dashboard web.

## Features

- Updates automatiques des prix toutes les X minutes (configurable 5-60min)
- Embeds riches avec logos, variations 1h/24h/7j, volume, market cap
- Channels dynamiques avec noms mis a jour (ex: `📈┃btc-45234-usd`)
- Systeme d'alertes personnalisables (prix cible, variation %)
- Dashboard web avec OAuth2 Discord
- Slash commands completes (20+ commandes)
- CoinMarketCap API avec fallback CoinGecko
- Cache intelligent pour optimiser les appels API
- Deploiement AWS EC2 avec PM2

## Prerequis

- Node.js 18+
- Compte Discord Developer avec bot cree
- CoinMarketCap API Key (gratuit sur [coinmarketcap.com/api](https://coinmarketcap.com/api/))
- (Optionnel) AWS EC2 t2.micro pour le deploiement

## Installation

### 1. Cloner le repository

```bash
git clone <repo-url>
cd crypto-tracker-bot
```

### 2. Installer les dependances

```bash
npm install
```

### 3. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Editez `.env` avec vos credentials :

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Token de votre bot Discord |
| `DISCORD_CLIENT_ID` | Client ID de l'application Discord |
| `DISCORD_CLIENT_SECRET` | Client secret (pour le dashboard web) |
| `DISCORD_GUILD_ID` | ID du serveur Discord (dev: commandes guild) |
| `CMC_API_KEY` | Cle API CoinMarketCap |
| `UPDATE_INTERVAL` | Intervalle de MAJ en ms (defaut: 600000 = 10min) |
| `ALERT_THRESHOLD` | Seuil d'alerte par defaut en % (defaut: 5) |
| `WEB_PORT` | Port du dashboard web (defaut: 3000) |
| `SESSION_SECRET` | Secret pour les sessions web |
| `BASE_URL` | URL de base du dashboard |

### 4. Enregistrer les slash commands

```bash
npm run deploy-commands
```

### 5. Demarrer le bot

```bash
npm start
```

En mode developpement (auto-reload) :

```bash
npm run dev
```

## Commandes Discord

### Administration (Admins uniquement)

| Commande | Description |
|----------|-------------|
| `/setup` | Configuration guidee interactive |
| `/config interval <minutes>` | Modifier l'intervalle de MAJ (5-60min) |
| `/config alert-threshold <percent>` | Seuil d'alertes par defaut |
| `/config category <nom>` | Renommer la categorie |
| `/config reset` | Reset complet de la configuration |
| `/track <symbol>` | Ajouter une crypto a tracker |
| `/untrack <symbol>` | Retirer une crypto |
| `/panel` | Panel d'administration interactif |
| `/admin stats` | Statistiques du bot |
| `/admin restart` | Redemarrer le scheduler |
| `/admin logs [lines]` | Voir les derniers logs |
| `/reload` | Forcer une mise a jour immediate |

### Consultation (Tous les membres)

| Commande | Description |
|----------|-------------|
| `/price <symbol>` | Prix detaille d'une crypto |
| `/chart <symbol> [period]` | Graphique avec liens TradingView |
| `/top [count]` | Top cryptos par market cap |
| `/compare <symbol1> <symbol2>` | Comparer deux cryptos |
| `/search <name>` | Chercher une crypto par nom |
| `/list` | Liste des cryptos trackees |

### Alertes (Tous les membres)

| Commande | Description |
|----------|-------------|
| `/alert set <symbol> <type> <value>` | Creer une alerte |
| `/alert list` | Mes alertes actives |
| `/alert remove <id>` | Supprimer une alerte |
| `/alert clear` | Supprimer toutes mes alertes |

Types d'alertes : `above` (au-dessus), `below` (en-dessous), `change` (variation %)

## Dashboard Web

Le dashboard est accessible sur `http://localhost:3000` (ou votre domaine).

- **Authentification** : OAuth2 Discord (seuls les admins du serveur ont acces)
- **Pages** : Dashboard, Gestion Cryptos, Configuration, Logs

## Deploiement AWS EC2

### Configuration initiale du serveur

```bash
# Sur le serveur EC2 Ubuntu
chmod +x setup.sh
./setup.sh
```

### Deploiement automatise

```bash
# Depuis votre machine locale
export EC2_IP=your-ec2-ip
export PEM_KEY=~/.ssh/your-key.pem
chmod +x deploy.sh
./deploy.sh
```

### PM2

```bash
# Demarrer
pm2 start ecosystem.config.js

# Status
pm2 list

# Logs
pm2 logs crypto-bot

# Restart
pm2 restart crypto-bot
```

## Architecture

```
src/
├── index.js                     # Point d'entree
├── bot/
│   ├── client.js                # Discord client setup
│   ├── deploy-commands.js       # Enregistrement slash commands
│   └── events/
│       ├── ready.js             # Event bot ready
│       └── interactionCreate.js # Gestion interactions
├── commands/
│   ├── admin/                   # Commandes admin
│   ├── public/                  # Commandes publiques
│   └── alerts/                  # Commandes alertes
├── services/
│   ├── crypto-api.js            # CoinMarketCap + CoinGecko
│   ├── channel-manager.js       # Gestion channels Discord
│   ├── embed-builder.js         # Construction embeds
│   ├── alert-service.js         # Systeme alertes
│   ├── cache-service.js         # Cache intelligent
│   └── scheduler.js             # Cron jobs updates
├── utils/
│   ├── formatter.js             # Format prix/nombres
│   ├── logger.js                # Winston config
│   ├── permissions.js           # Check admin
│   └── validators.js            # Validation inputs
├── web/
│   ├── server.js                # Express app
│   ├── routes/                  # Routes web
│   ├── views/                   # Templates EJS
│   └── public/                  # Assets statiques
└── database/
    ├── db.js                    # Abstraction DB (JSON)
    └── models/                  # Models config/crypto/alert
```

## Limites API

- **CoinMarketCap** : 333 calls/jour (plan gratuit) - le cache reduit la consommation
- **Discord** : 2 channel name updates / 10min - gere par une queue avec delais
- **Discord** : 50 slash commands max - les commandes sont groupees en subcommands

## Licence

MIT
