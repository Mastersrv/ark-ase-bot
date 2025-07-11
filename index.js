
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`✅ Bot ARK ASE đã đăng nhập với tên ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return; // bỏ qua bot
  if (message.content === '!ping') {
    await message.reply('Pong! 🏓');
  }
});

client.login(process.env.TOKEN);
