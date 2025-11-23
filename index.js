const mineflayer = require('mineflayer');
const axios = require('axios');
const express = require('express');

// Configuration
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'YOUR_DISCORD_WEBHOOK_URL_HERE';
const WHITELIST = (process.env.WHITELIST || 'Player1,Player2,YourUsername').split(',');
const MINECRAFT_HOST = process.env.MINECRAFT_HOST || 'localhost';
const MINECRAFT_PORT = parseInt(process.env.MINECRAFT_PORT || '25565');
const BOT_USERNAME = process.env.BOT_USERNAME || 'SecurityBot';
const DETECTION_RANGE = 15 * 16; // 15 chunks (1 chunk = 16 blocks)
const CHECK_INTERVAL = 2000; // Check every 2 seconds
const PORT = process.env.PORT || 3000;

// Track already notified players to avoid spam
const notifiedPlayers = new Set();
const notificationCooldown = 60000; // 1 minute cooldown per player

let bot;
let botStatus = {
  online: false,
  lastCheck: new Date(),
  playersDetected: 0
};

// Create Express server for health checks
const app = express();

app.get('/', (req, res) => {
  res.json({
    status: 'Bot is running',
    botOnline: botStatus.online,
    lastCheck: botStatus.lastCheck,
    playersDetected: botStatus.playersDetected,
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
});

// Send message to Discord webhook
async function sendDiscordAlert(playerInfo) {
  try {
    const embed = {
      embeds: [{
        title: 'our base might be fucked',
        color: 0xFF0000, // Red
        fields: [
          {
            name: 'Player name',
            value: playerInfo.username,
            inline: true
          },
          {
            name: 'Distance',
            value: `${playerInfo.distance.toFixed(1)} blocks`,
            inline: true
          },
          {
            name: 'Position',
            value: `X: ${playerInfo.position.x}\nY: ${playerInfo.position.y}\nZ: ${playerInfo.position.z}`,
            inline: false
          },
          {
            name: 'Bot position',
            value: `X: ${playerInfo.botPosition.x}\nY: ${playerInfo.botPosition.y}\nZ: ${playerInfo.botPosition.z}`,
            inline: false
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: 'base protector bot'
        }
      }]
    };

    await axios.post(DISCORD_WEBHOOK_URL, embed);
    console.log(`Alert sent for player: ${playerInfo.username}`);
    botStatus.playersDetected++;
  } catch (error) {
    console.error('Error sending Discord webhook:', error.message);
  }
}

// Check for unauthorized players
function checkForIntruders() {
  if (!bot || !bot.entity) return;
  
  const players = Object.values(bot.players);
  botStatus.lastCheck = new Date();
  
  for (const player of players) {
    // Skip if player is the bot itself
    if (player.username === bot.username) continue;
    
    // Skip if player is whitelisted
    if (WHITELIST.includes(player.username)) continue;
    
    // Skip if player entity is not loaded
    if (!player.entity) continue;
    
    // Calculate distance
    const distance = bot.entity.position.distanceTo(player.entity.position);
    
    // Check if within detection range
    if (distance <= DETECTION_RANGE) {
      // Check cooldown to avoid spam
      if (!notifiedPlayers.has(player.username)) {
        const playerInfo = {
          username: player.username,
          distance: distance,
          position: {
            x: Math.floor(player.entity.position.x),
            y: Math.floor(player.entity.position.y),
            z: Math.floor(player.entity.position.z)
          },
          botPosition: {
            x: Math.floor(bot.entity.position.x),
            y: Math.floor(bot.entity.position.y),
            z: Math.floor(bot.entity.position.z)
          }
        };
        
        sendDiscordAlert(playerInfo);
        notifiedPlayers.add(player.username);
        
        // Remove from cooldown after specified time
        setTimeout(() => {
          notifiedPlayers.delete(player.username);
        }, notificationCooldown);
      }
    }
  }
}

function createBot() {
  bot = mineflayer.createBot({
    host: MINECRAFT_HOST,
    port: MINECRAFT_PORT,
    username: BOT_USERNAME,
    // Add auth if needed: auth: 'microsoft' or 'mojang'
  });

  bot.on('login', () => {
    console.log('Bot logged in successfully');
    console.log(`Monitoring for unauthorized players within ${DETECTION_RANGE / 16} chunks`);
    botStatus.online = true;
    
    // Start checking for intruders
    setInterval(checkForIntruders, CHECK_INTERVAL);
  });

  bot.on('playerJoined', (player) => {
    console.log(`Player joined: ${player.username}`);
  });

  bot.on('playerLeft', (player) => {
    console.log(`Player left: ${player.username}`);
    notifiedPlayers.delete(player.username);
  });

  bot.on('error', (err) => {
    console.error('Bot error:', err);
    botStatus.online = false;
  });

  bot.on('kicked', (reason) => {
    console.log('Bot was kicked:', reason);
    botStatus.online = false;
    // Reconnect after 5 seconds
    setTimeout(createBot, 5000);
  });

  bot.on('end', () => {
    console.log('Bot disconnected');
    botStatus.online = false;
    // Reconnect after 5 seconds
    setTimeout(createBot, 5000);
  });
}

// Start the bot
createBot();