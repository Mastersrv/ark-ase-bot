// index.js – ARK ASE bot 24/7 trên Render Free
require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

// ===== KEEP‑ALIVE EXPRESS SERVER =====
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("✅ Bot is running!"));
app.listen(PORT, () => console.log(`🌐 Keep‑alive server chạy cổng ${PORT}`));

// ===== DISCORD BOT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`✅ Bot ARK ASE đã đăng nhập với tên ${client.user.tag}`);
});

// ===== LEVELING SYSTEM =====
const { QuickDB } = require("quick.db");
const db = new QuickDB();
const calcLevel = xp => Math.floor(0.1 * Math.sqrt(xp));

/* ---------- Listener duy nhất ---------- */
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const content = msg.content.toLowerCase();

  // !ping
  if (content === "!ping") {
    return msg.reply("Pong!!! 🏓");
  }

  // !rank
  if (content === "!rank") {
    const xp = (await db.get(`xp_${msg.guildId}_${msg.author.id}`)) || 0;
    const level = calcLevel(xp);
    return msg.reply(`Bạn đang ở cấp **${level}** với **${xp} XP**.`);
  }

  // !top
  if (content === "!top") {
    const all = await db.all();
    const top = all
      .filter(d => d.id.startsWith(`xp_${msg.guildId}_`))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const list = top.length
      ? top.map((d, i) => {
          const userId = d.id.split("_")[2];
          return `**#${i + 1}** <@${userId}> – ${d.value} XP`;
        }).join("\n")
      : "Chưa có dữ liệu.";

    return msg.channel.send(`🏆 **Top 5 XP**\n${list}`);
  }

  // Cộng XP cho tin nhắn thường (không phải lệnh)
  if (!content.startsWith("!")) {
    const key = `xp_${msg.guildId}_${msg.author.id}`;
    let xp = (await db.get(key)) || 0;
    xp += 10;
    await db.set(key, xp);

    const oldLvl = calcLevel(xp - 10);
    const newLvl = calcLevel(xp);
    if (newLvl > oldLvl) {
      msg.channel.send(`🎉 <@${msg.author.id}> đã lên cấp **${newLvl}**!`);
    }
  }
});
/* ---------- Hết listener ---------- */

// Kết nối sau khi đã khai báo mọi sự kiện
client.login(process.env.TOKEN);
 
