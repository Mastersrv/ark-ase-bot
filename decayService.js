// decayService.js
const supabase = require('./supabase');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");


const MAPS = [
  "TheIsland","Valguero","Ragnarök","TheCenter","CrystalIsles",
  "Aberration","Extinction","ScorchedEarth","Genesis1","Genesis2",
  "Fjordur","LostIsland","Aquatica"
];
// Note: bạn có thể thêm map vào đây nếu cần

async function ensureUser(userId, username='') {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) {
    await supabase.from('users').insert({ id: userId, username });
  } else if (username && data.username !== username) {
    await supabase.from('users').update({ username }).eq('id', userId);
  }
}

async function addOrResetDecay(userId, username, mapName, decayDays) {
  await ensureUser(userId, username);
  // upsert using unique index (user_id, map_name)
  const { error } = await supabase
    .from('decays')
    .upsert(
      { user_id: userId, map_name: mapName, decay_days: decayDays, start_time: new Date().toISOString() },
      { onConflict: ['user_id','map_name'] }
    );
  if (error) throw error;
  return true;
}

async function editDecay(userId, mapName, decayDays) {
  const { error } = await supabase
    .from('decays')
    .update({ decay_days: decayDays, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('map_name', mapName);
  if (error) throw error;
  return true;
}

async function deleteDecay(userId, mapName) {
  const { error } = await supabase
    .from('decays')
    .delete()
    .eq('user_id', userId)
    .eq('map_name', mapName);
  if (error) throw error;
  return true;
}

async function resetDecay(userId, mapName) {
  const { error } = await supabase
    .from('decays')
    .update({ start_time: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('map_name', mapName);
  if (error) throw error;
  return true;
}

async function getUserDecays(userId) {
  const { data, error } = await supabase.from('decays').select('*').eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

async function getBotMessageRow(key) {
  const { data, error } = await supabase.from('bot_messages').select('*').eq('key', key).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}
async function upsertBotMessage(key, channel_id, message_id) {
  const { error } = await supabase
    .from('bot_messages')
    .upsert({ key, channel_id, message_id, updated_at: new Date().toISOString() }, { onConflict: ['key'] });
  if (error) throw error;
}

/**
 * Hàm checkDecayReminders
 * - quét tất cả decays
 * - nếu còn 3 / 2 / 1 ngày thì gửi thông báo vào NEWS_SPAM_ID và tag user
 * - tránh spam nhờ cột last_notified_days
 */
async function checkDecayReminders(client) {
  const { data: decays, error } = await supabase.from("decays").select("*");
  if (error) {
    console.error("❌ Lỗi lấy dữ liệu decay:", error);
    return;
  }

  for (const d of decays) {
    const end = new Date(d.start_time).getTime() + d.decay_days * 24 * 60 * 60 * 1000;
    const leftMs = end - Date.now();
    const leftDays = Math.max(0, Math.floor(leftMs / (24 * 3600 * 1000)));
    const leftHours = Math.max(0, Math.floor((leftMs % (24 * 3600 * 1000)) / (3600 * 1000)));

    // Chỉ gửi khi còn 3 / 2 / 1 ngày và chưa gửi cho mốc đó
    if ([3, 2, 1].includes(leftDays) && d.last_notified_days !== leftDays) {
      try {
        const user = await client.users.fetch(d.user_id).catch(() => null);
        if (!user) continue;

        // Gọi embed chuyên nghiệp (hàm bạn đã thêm ở decayService.js)
        await sendDecayAlertEmbed(
          client,
          user,
          d.map_name,
          d.map_label,
          leftDays,
          leftHours,
          "ASE"
        );

        // Cập nhật mốc đã gửi
        await supabase
          .from("decays")
          .update({ last_notified_days: leftDays })
          .eq("id", d.id);
      } catch (err) {
        console.error("❌ Lỗi khi gửi cảnh báo ASE:", err);
      }
    }
  }
}

async function updateDecayMessage(client) {
  try {
    const row = await getBotMessageRow("check_decay_message");
    if (!row) return;

    const channel = await client.channels.fetch(process.env.NEWS_CHECKDECAY_ID);
    const message = await channel.messages.fetch(row.message_id);

    const ownerId = "680726526010064899";
    const { data: decays, error } = await supabase
      .from("decays")
      .select("*")
      .eq("user_id", process.env.OWNER_ID);

    if (error) throw error;

    // 🎨 Header mô tả
    let header = `**📋 Decay list của <@${ownerId}>**\n*Cập nhật tự động mỗi 30s*\n\n`;

    // 🔹 Tạo các “ô map” kiểu list
    const boxList = MAPS.map((map) => {
      const record = decays.find((d) => d.map_name === map);
      let status;
      const now = Date.now();

      if (!record) {
        status = "⚫ **Chưa thiết lập**";
      } else {
        const end = new Date(record.start_time).getTime() + record.decay_days * 86400000;
        const leftMs = end - now;
        const leftDays = Math.max(0, Math.floor(leftMs / 86400000));
        const leftHours = Math.max(0, Math.floor((leftMs % 86400000) / 3600000));

        if (leftMs <= 0) status = "🔴 **Đã hết hạn decay**";
        else if (leftDays <= 1) status = `🟠 Còn **${leftDays} ngày ${leftHours} giờ**`;
        else status = `🟢 Còn **${leftDays} ngày ${leftHours} giờ**`;
      }

      // 🧱 Mô phỏng “ô box” bằng blockquote + code block nhẹ
      return `> 🗺️ **${map}**\n> \`${status.replace(/\*/g, "")}\``;
    }).join("\n\n");

    // 🧾 Gộp mô tả cuối cùng
    const description = header + boxList;

    // ✨ Embed layout
    const embed = new EmbedBuilder()
      .setColor(0x1e1f22)
      .setTitle("🛡️ Check Decay - Overview")
      .setDescription(description)
      .setThumbnail("https://cdn-icons-png.flaticon.com/512/561/561611.png")
      .setTimestamp()
      .setFooter({
        text: "Brought to you by Kalendell • cập nhật tự động",
        iconURL: client.user.displayAvatarURL(),
      });

    // 🔘 Nút thao tác
    const rowComponents = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("view_my_decay")
        .setLabel("Hiển thị check decay của bạn")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("add_decay")
        .setLabel("Add check decay")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("edit_decay")
        .setLabel("Edit check decay")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("delete_decay")
        .setLabel("Delete decay")
        .setStyle(ButtonStyle.Danger)
    );

    await message.edit({ embeds: [embed], components: [rowComponents] });
  } catch (err) {
    console.error("❌ Lỗi updateDecayMessage:", err);
  }
}



/**
 * Gửi thông báo decay chuyên nghiệp cho ASE (ảnh nền GIF ngẫu nhiên)
 * @param {object} client - Discord Client
 * @param {object} user - User Discord (người nhận)
 * @param {string} mapName - Tên map (vd: THEISLAND)
 * @param {number} daysLeft - Ngày còn lại
 * @param {number} hoursLeft - Giờ còn lại
 */
async function sendDecayAlertEmbed(client, user, mapName, daysLeft, hoursLeft) {
  // 🎨 Màu và icon theo thời gian còn lại
  let color = 0xf1c40f; // vàng mặc định (3 ngày)
  let icon = "⚠️";
  if (daysLeft <= 2) {
    color = 0xe74c3c; // đỏ khẩn cấp
    icon = "🚨";
  }

  // 🌆 Ảnh GIF nền ngẫu nhiên (bạn thay 5 link này bằng link từ Discord)
  const backgroundGifs = [
    "https://media.discordapp.net/attachments/.../image1.gif",
    "https://media.discordapp.net/attachments/.../image2.gif",
    "https://media.discordapp.net/attachments/.../image3.gif",
    "https://media.discordapp.net/attachments/.../image4.gif",
    "https://media.discordapp.net/attachments/.../image5.gif"
  ];
  const randomImage = backgroundGifs[Math.floor(Math.random() * backgroundGifs.length)];

  // 🧱 Tạo embed cảnh báo đẹp mắt
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} BASE DECAY WARNING (ASE)`)
    .setDescription(
      `**<@${user.id}>**, base của bạn sắp bị decay!\n\n` +
      `🗺️ **Map:** ${mapName.toUpperCase()}\n` +
      `⏳ **Thời gian còn lại:** ${daysLeft} ngày ${hoursLeft} giờ\n` +
      `📅 **Hệ thống:** ASE\n\n` +
      `> Hãy vào game và chạm vào base để reset decay trước khi hết hạn.`
    )
    .setThumbnail(user.displayAvatarURL())
    .setImage(randomImage)
    .setTimestamp()
    .setFooter({
      text: "Brought to you by Ayaka • ASE Decay Monitor",
      iconURL: client.user.displayAvatarURL()
    });

  // 📢 Gửi tin nhắn đến channel thông báo ASE
  const channelId = process.env.NEWS_SPAM_ID;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return console.warn("⚠️ Không tìm thấy channel thông báo ASE");

  await channel.send({ embeds: [embed] });
}



module.exports = {
  MAPS,
  ensureUser,
  addOrResetDecay,
  editDecay,
  deleteDecay,
  resetDecay,
  getUserDecays,
  getBotMessageRow,
  upsertBotMessage,
  updateDecayMessage,
  checkDecayReminders,
  sendDecayAlertEmbed
};