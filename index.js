
require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const { QuickDB } = require("quick.db");
const db = new QuickDB();

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

// ===== ROLE ÁNH XẠ LEVEL =====
const levelRoles = {
  1:   "1393347597359382723",
  10:  "1393347839152750734",
  100: "1393347907972890754",
  999: "1393347979427057706",
};

// ===== HÀM TÍNH CẤP =====
const calcLevel = (xp) => Math.floor(0.1 * Math.sqrt(xp));

/* ---------- Listener duy nhất ---------- */
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const content = msg.content.toLowerCase();

  /* ===== LỆNH ===== */
  if (content === "!aya")   return msg.reply("Aya đây, mời bạn lói :akblackcat:");

  if (content === "!rank") {
    const xp = (await db.get(`xp_${msg.guildId}_${msg.author.id}`)) || 0;
    const level = calcLevel(xp);
    return msg.reply(`Bạn đang ở đẳng cấp **${level}** với **${xp} :emoji120: **.`);
  }

  if (content === "!top") {
  const all = await db.all();
  const top = all
    .filter(d => d.id.startsWith(`xp_${msg.guildId}_`))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Lấy thông tin tên người dùng (không ping)
  const list = await Promise.all(
    top.map(async (d, i) => {
      const userId = d.id.split("_")[2];
      // Lấy member trong guild để có nickname; fallback sang user tag
      let displayName;
      try {
        const member = await msg.guild.members.fetch(userId);
        displayName = member.displayName || member.user.tag;
      } catch {
        // nếu không fetch được (rời guild) → chỉ hiển thị ID
        displayName = `User ${userId}`;
      }
      return `**#${i + 1}** ${displayName} – ${d.value} XP`;
    })
  );

  return msg.channel.send(`🏆 **Top 5 người chơi nhiều chuyện nhất trong ngày**\n${list.join("\n")}`);
}

  /* ===== CỘNG XP CHO TIN NHẮN THƯỜNG ===== */
  if (!content.startsWith("!")) {
    const key = `xp_${msg.guildId}_${msg.author.id}`;
    let xp = (await db.get(key)) || 0;
    xp += 10;
    await db.set(key, xp);

    const oldLvl = calcLevel(xp - 10);
    const newLvl = calcLevel(xp);

    if (newLvl > oldLvl) {
      msg.channel.send(`🎉 <@${msg.author.id}> đã lên cấp **${newLvl}**!`);

      /* ===== GÁN / GỠ ROLE THEO CẤP ===== */
      // tìm mốc role cao nhất ≤ cấp hiện tại
      const thresholds = Object.keys(levelRoles).map(Number).sort((a,b)=>b-a);
      let targetRoleId;
      for (const lv of thresholds) {
        if (newLvl >= lv) { targetRoleId = levelRoles[lv]; break; }
      }
      if (targetRoleId) {
        const member = await msg.guild.members.fetch(msg.author.id);

        // gỡ role level cũ (giữ duy nhất 1 role cấp)
        for (const id of Object.values(levelRoles)) {
          if (id !== targetRoleId && member.roles.cache.has(id)) {
            await member.roles.remove(id).catch(()=>{});
          }
        }
        // thêm role mới
        if (!member.roles.cache.has(targetRoleId)) {
          await member.roles.add(targetRoleId).catch(()=>{});
        }
      }
    }
  }
});

/* ---------- Hết listener ---------- */


client.login(process.env.TOKEN);

