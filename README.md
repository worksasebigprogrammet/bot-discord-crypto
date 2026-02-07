# Crypto Tracker Bot v2.0

Bot Discord multi-serveur pour tracker les prix de cryptomonnaies en temps reel avec alertes, bots externes et support bilingue FR/EN.

## Nouveautes v2.0

- **Multi-serveur** : chaque serveur a sa configuration independante
- **100+ cryptos** : autocomplete sur `/track` avec 500+ cryptos CoinMarketCap
- **Bots externes** : creez des bots dedies qui affichent un prix crypto en statut
- **i18n FR/EN** : toutes les reponses traduites, configurable par serveur
- **Panel admin ameliore** : boutons, modals, gestion complete
- **Dashboard web supprime** : tout se gere via Discord

## Features

- Updates automatiques des prix toutes les X minutes (configurable 5-60min)
- Embeds riches avec logos, variations 1h/24h/7j, volume, market cap
- Channels dynamiques avec noms mis a jour (ex: `📈┃btc-45234-usd`)
- Systeme d'alertes personnalisables (prix cible, variation %)
- Bots externes avec statut crypto personnalisable (4 formats)
- 15+ slash commands avec autocomplete
- CoinMarketCap API avec fallback CoinGecko
- Cache intelligent pour optimiser les appels API (333 calls/jour)
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
cd bot-discord-crypto
```

### 2. Installer les dependances

```bash
npm install
```

### 3. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Editez `.env` :

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Token de votre bot Discord |
| `DISCORD_CLIENT_ID` | Client ID de l'application Discord |
| `DISCORD_GUILD_ID` | ID du serveur Discord (dev: commandes guild) |
| `CMC_API_KEY` | Cle API CoinMarketCap |

### 4. Enregistrer les slash commands

```bash
npm run deploy-commands
```

### 5. Demarrer le bot

```bash
npm start
```

Mode developpement (auto-reload) :

```bash
npm run dev
```

## Commandes Discord

### Administration (Admins uniquement)

| Commande | Description |
|----------|-------------|
| `/setup` | Configuration guidee interactive (4 etapes) |
| `/config interval <minutes>` | Modifier l'intervalle de MAJ (5-60min) |
| `/config alert-threshold <percent>` | Seuil d'alertes par defaut |
| `/config language <FR\|EN>` | Changer la langue du serveur |
| `/config category <nom>` | Renommer la categorie |
| `/config reset` | Reset complet de la configuration |
| `/track <symbol>` | Ajouter une crypto (autocomplete 500+) |
| `/untrack <symbol>` | Retirer une crypto |
| `/panel` | Panel d'administration interactif avec boutons |
| `/stats` | Statistiques du bot (uptime, RAM, API calls...) |
| `/reload` | Forcer une mise a jour immediate |

### Bots Externes (Admins uniquement)

| Commande | Description |
|----------|-------------|
| `/bot create <token> <crypto>` | Creer un bot avec statut crypto |
| `/bot list` | Lister les bots externes |
| `/bot edit <id> <crypto>` | Changer la crypto d'un bot |
| `/bot delete <id>` | Supprimer un bot externe |
| `/bot format <id> <format>` | Changer le format (simple/full/minimal/emoji) |
| `/bot status <text>` | Changer le statut du bot principal |

Formats de statut disponibles :
- `simple` : `BTC: $95,234.56`
- `full` : `Bitcoin (BTC) | $95,234.56 | +2.4%`
- `minimal` : `$95,234.56`
- `emoji` : `🪙 BTC: $95,234.56 (+2.4% 📈)`

### Consultation (Tous les membres)

| Commande | Description |
|----------|-------------|
| `/price <symbol>` | Prix detaille d'une crypto |
| `/chart <symbol> [period]` | Graphique ASCII + liens TradingView |
| `/top [count]` | Top cryptos par market cap (1-25) |
| `/compare <c1> <c2> [c3] [c4] [c5]` | Comparer 2-5 cryptos |
| `/search <name>` | Chercher une crypto par nom |
| `/list` | Liste des cryptos trackees sur ce serveur |

### Alertes (Tous les membres)

| Commande | Description |
|----------|-------------|
| `/alert set <symbol> <type> <value>` | Creer une alerte |
| `/alert list` | Mes alertes actives |
| `/alert remove <id>` | Supprimer une alerte |
| `/alert clear` | Supprimer toutes mes alertes |

Types d'alertes : `above` (au-dessus), `below` (en-dessous), `change` (variation %)

## Multi-Serveur

Chaque serveur Discord a sa propre configuration stockee dans `data/guilds/{guildId}.json` :
- Cryptos trackees independantes
- Alertes par utilisateur et par serveur
- Langue (FR/EN), intervalle, seuils, timezone configurables
- Isolation complete entre serveurs

## Deploiement AWS EC2

### Configuration initiale

```bash
chmod +x setup.sh
./setup.sh
```

### Deploiement automatise

```bash
export EC2_IP=your-ec2-ip
export PEM_KEY=~/.ssh/your-key.pem
chmod +x deploy.sh
./deploy.sh
```

### PM2

```bash
pm2 start ecosystem.config.js
pm2 list
pm2 logs crypto-bot
pm2 restart crypto-bot
```

## Architecture

```
src/
├── index.js                     # Point d'entree
├── bot/
│   ├── client.js                # Discord client setup
│   ├── deploy-commands.js       # Enregistrement slash commands
│   ├── external-bots.js         # Module bots externes
│   └── events/
│       ├── ready.js             # Event bot ready
│       └── interactionCreate.js # Gestion interactions
├── commands/
│   ├── admin/                   # setup, config, track, untrack, panel, stats, bot
│   ├── public/                  # price, chart, top, compare, search, list, reload
│   └── alerts/                  # alert (set/list/remove/clear)
├── services/
│   ├── crypto-api.js            # CoinMarketCap + CoinGecko fallback
│   ├── channel-manager.js       # Gestion channels Discord
│   ├── embed-builder.js         # Construction embeds i18n
│   ├── alert-service.js         # Systeme alertes multi-serveur
│   ├── cache-service.js         # Cache intelligent
│   ├── scheduler.js             # Updates periodiques
│   ├── bot-manager.js           # Gestion bots externes
│   └── i18n.js                  # Systeme de traduction
├── locales/
│   ├── fr.json                  # Traductions francais
│   └── en.json                  # Traductions anglais
├── utils/
│   ├── formatter.js             # Format prix/nombres
│   ├── logger.js                # Winston config
│   ├── permissions.js           # Check admin
│   └── validators.js            # Validation inputs
└── database/
    ├── db.js                    # Abstraction DB (JSON)
    └── models/
        ├── guild.js             # Config par serveur
        └── bot.js               # Bots externes
data/
├── guilds/{guildId}.json        # Config par serveur
└── bots/{botId}.json            # Config bots externes
```

## Limites

- **CoinMarketCap** : 333 calls/jour (plan gratuit) - cache optimise
- **Discord** : 2 channel name updates / 10min - queue avec delais
- **Bots externes** : max 20 par serveur
- **Alertes** : max 25 par utilisateur par serveur
- **RAM** : optimise pour EC2 t2.micro (1GB)

## Licence

MIT
