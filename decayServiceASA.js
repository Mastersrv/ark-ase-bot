// decayServiceASA.js
const supabase = require("./supabase");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
} = require("discord.js");

/* ==========================
   MAP LIST ASA
========================== */
const ASA_MAPS = [
  "THEISLAND",
  "THECENTER",
  "RAGNAROK",
  "EXTINCTION",
  "ABERRATION",
  "ASTRAEOS",
  "SCORCHEDEARTH",
  "MAP KHÁC",
];

/* ==========================
   USER MANAGEMENT
========================== */
async function ensureUserASA(userId, username = "") {
  const { data, error } = await supabase
    .from("users_asa")
    .select("*")
    .eq("id", userId)
    .single();
  if (error && error.code !== "PGRST116") throw error;

  if (!data) {
    await supabase.from("users_asa").insert({ id: userId, username });
  } else if (username && data.username !== username) {
    await supabase.from("users_asa").update({ username }).eq("id", userId);
  }
}

/* ==========================
   CRUD FUNCTIONS
========================== */
async function addOrResetDecayASA(
  userId,
  username,
  mapName,
  decayDays,
  mapLabel = null
) {
  await ensureUserASA(userId, username);

  // kiểm tra giới hạn 20 map / user
  const { data: existing } = await supabase
    .from("decays_asa")
    .select("*")
    .eq("user_id", userId);

  if (existing && existing.length >= 20)
    throw new Error("Bạn chỉ có thể add tối đa 20 map!");

  // ✅ kiểm tra trùng map_name + map_label
  const duplicate = existing.find(
    (d) =>
      d.map_name === mapName &&
      (d.map_label || "").toLowerCase() === (mapLabel || "").toLowerCase()
  );

  if (duplicate) {
    throw new Error(
      `⚠️ Map **${mapName}${mapLabel ? " - " + mapLabel : ""}** đã tồn tại!`
    );
  }

  const { error } = await supabase.from("decays_asa").insert({
    user_id: userId,
    map_name: mapName,
    map_label: mapLabel,
    decay_days: decayDays,
    start_time: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
  return true;
}

async function editDecayASA(userId, mapName, newDays) {
  const { error } = await supabase
    .from("decays_asa")
    .update({
      decay_days: newDays,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("map_name", mapName);

  if (error) throw error;
}

async function deleteDecayASA(userId, mapName, mapLabel = null) {
  let query = supabase
    .from("decays_asa")
    .delete()
    .eq("user_id", userId)
    .eq("map_name", mapName);
  if (mapLabel) query = query.eq("map_label", mapLabel);
  const { error } = await query;
  if (error) throw error;
}

async function resetDecayASA(userId, mapName, mapLabel = null) {
  let query = supabase
    .from("decays_asa")
    .update({
      start_time: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("map_name", mapName);

  if (mapLabel) query = query.eq("map_label", mapLabel);

  const { error } = await query;
  if (error) throw error;
}

/* Reset ALL map đã thêm */
async function resetAllDecaysASA(userId) {
  const { error } = await supabase
    .from("decays_asa")
    .update({
      start_time: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) throw error;
}

/* ==========================
   GET FUNCTIONS
========================== */
async function getUserDecaysASA(userId) {
  const { data, error } = await supabase
    .from("decays_asa")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/* ==========================
   EMBED DISPLAY
========================== */
async function buildDecayListEmbed(user, decays) {
  let desc = `**🔁 Decay list của ${user.username}**\n*Cập nhật theo thời gian thực*\n\n`;

  if (decays.length === 0) {
    desc += "> ❌ Chưa add map nào.\nDùng nút **Add check decay** để bắt đầu.";
  } else {
    for (const d of decays) {
      const end =
        new Date(d.start_time).getTime() + d.decay_days * 24 * 60 * 60 * 1000;
      const leftMs = end - Date.now();
      const leftDays = Math.max(0, Math.floor(leftMs / 86400000));
      const leftHours = Math.max(0, Math.floor((leftMs % 86400000) / 3600000));

      let status;
      if (leftMs <= 0) status = `🔴 **Đã hết hạn decay**`;
      else if (leftDays <= 1)
        status = `🟠 **Còn ${leftDays} ngày ${leftHours} giờ**`;
      else status = `🟢 **Còn ${leftDays} ngày ${leftHours} giờ**`;

      const mapTitle = d.map_label
        ? `${d.map_name} - ${d.map_label}`
        : d.map_name;
      desc += `> 🗺️ **${mapTitle}**\n> \`${status.replace(/\*/g, "")}\`\n\n`;
    }
  }

  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle("🧭 Check Decay - ASA")
    .setDescription(desc)
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp()
    .setFooter({
      text: "Dữ liệu riêng tư — chỉ bạn thấy",
      iconURL: user.displayAvatarURL(),
    });
}

/* ==========================
   CHECK REMINDER (TỰ ĐỘNG)
========================== */
async function checkDecayRemindersASA(client) {
  const { data: decays, error } = await supabase.from("decays_asa").select("*");
  if (error) {
    console.error("Lỗi lấy dữ liệu decay ASA:", error);
    return;
  }

  for (const d of decays) {
  const end = new Date(d.start_time).getTime() + d.decay_days * 24 * 60 * 60 * 1000;
  const leftMs = end - Date.now();
  const leftDays = Math.max(0, Math.floor(leftMs / (24 * 3600 * 1000)));
  const leftHours = Math.max(0, Math.floor((leftMs % (24 * 3600 * 1000)) / (3600 * 1000)));

  // Gửi cảnh báo khi còn 3, 2, 1 ngày và chưa gửi cho mốc này
  if ([3, 2, 1].includes(leftDays) && d.last_notified_days !== leftDays) {
    try {
      const user = await client.users.fetch(d.user_id).catch(() => null);
      if (!user) continue;

      // 🧱 Gọi embed chuyên nghiệp
      await sendDecayAlertEmbed(
        client,
        user,
        d.map_name,
        d.map_label,
        leftDays,
        leftHours,
        "ASA"
      );

      // ✅ Cập nhật mốc đã gửi để không bị spam
      await supabase
        .from("decays_asa")
        .update({ last_notified_days: leftDays })
        .eq("id", d.id);

    } catch (err) {
      console.error("❌ Lỗi khi gửi cảnh báo ASA:", err);
    }
  }
}

}

/* ==========================
   UPDATE CHECK DECAY OVERVIEW
========================== */
/**
 * Tạo / đảm bảo tồn tại 1 message overview ASA duy nhất.
 * Key dùng trong bảng bot_messages_asa: 'overview_asa'
 */
async function ensureOverviewMessage(client) {
  const channelId = process.env.NEWS_CHECKDECAY_ID_ASA;
  if (!channelId) return console.warn("⚠️ Chưa có NEWS_CHECKDECAY_ID_ASA trong .env — skip ensureOverviewMessage.");

  const channel = await client.channels.fetch(channelId).catch((e) => {
    console.error("❌ Không fetch được channel ASA overview:", e);
    return null;
  });
  if (!channel) return;

  // Tạo embed hiện tại (dựa trên owner)
  const ownerId = process.env.OWNER_ID_ASA;
  const { data: decays } = await supabase
    .from("decays_asa")
    .select("*")
    .eq("user_id", ownerId);
  const embed = buildOverviewEmbedFromOwner(client, ownerId, decays || []);


  // Lấy record trong bot_messages_asa với key 'overview_asa'
  const { data: rows, error: fetchErr } = await supabase
    .from("bot_messages_asa")
    .select("*")
    .eq("key", "overview_asa");

  if (fetchErr) {
    console.error("❌ Lỗi khi đọc bot_messages_asa:", fetchErr);
    return;
  }

  const row = rows && rows.length ? rows[0] : null;

  try {
    if (row && row.message_id) {
      // nếu message tồn tại, thử edit
      const msg = await channel.messages.fetch(row.message_id).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed] });
        console.log("✅ ensureOverviewMessage: Đã cập nhật message overview ASA hiện có.");
        return;
      }
    }

    // nếu không có row hoặc message không tìm thấy => gửi mới + upsert vào DB
    const sent = await channel.send({ embeds: [embed] });
    await supabase
      .from("bot_messages_asa")
      .upsert({
        key: "overview_asa",
        channel_id: channelId,
        message_id: sent.id,
        updated_at: new Date().toISOString(),
      });
    console.log("🆕 ensureOverviewMessage: Đã tạo message overview ASA mới và lưu vào DB.");
  } catch (err) {
    console.error("❌ Lỗi ensureOverviewMessage:", err);
  }
}

async function updateDecayOverview(client) {
  const channelId = process.env.NEWS_CHECKDECAY_ID_ASA;
  if (!channelId)
    return console.warn("⚠️ Chưa có NEWS_CHECKDECAY_ID_ASA trong .env — skip updateDecayOverview.");

  const channel = await client.channels.fetch(channelId).catch((e) => {
    console.error("❌ Không fetch được channel ASA overview:", e);
    return null;
  });
  if (!channel) return;

  const ownerId = process.env.OWNER_ID_ASA;
  const { data: decays, error: decayErr } = await supabase
    .from("decays_asa")
    .select("*")
    .eq("user_id", ownerId);

  if (decayErr) {
    console.error("❌ Lỗi khi lấy decays ASA:", decayErr);
    return;
  }

  const embed = buildOverviewEmbedFromOwner(client, ownerId, decays || []);


  // 🔘 Nút thao tác (buttons)
  const rowComponents = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("view_my_decay_asa")
      .setLabel("Hiển thị check decay ASA của bạn")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("add_decay_asa")
      .setLabel("Add check decay ASA")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("edit_decay_asa")
      .setLabel("Edit check decay ASA")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("delete_decay_asa")
      .setLabel("Delete decay ASA")
      .setStyle(ButtonStyle.Danger)
  );

  // Lấy message_id từ bot_messages_asa
  const { data: rows, error: fetchErr } = await supabase
    .from("bot_messages_asa")
    .select("*")
    .eq("key", "overview_asa");

  if (fetchErr) {
    console.error("❌ Lỗi khi đọc bot_messages_asa:", fetchErr);
    return;
  }

  const row = rows && rows.length ? rows[0] : null;

  try {
    if (row && row.message_id) {
      const msg = await channel.messages.fetch(row.message_id).catch(() => null);
      if (msg) {
        await msg.edit({
          embeds: [embed],
          components: [rowComponents],
        });
        // console.log("✅ updateDecayOverview: updated existing overview message.");
        return;
      }
    }

    // nếu không tìm thấy message (row cũ), gọi ensure để recreate
    await ensureOverviewMessage(client);
  } catch (err) {
    console.error("❌ Lỗi updateDecayOverview:", err);
  }
}

function buildOverviewEmbedFromOwner(client, ownerId, decays) {
  let desc = `**📋 Danh sách Decay ASA của <@${ownerId}>**\n*Cập nhật tự động mỗi giờ*\n\n`;

  if (!decays || decays.length === 0) {
    desc += "> ⚫ Chưa có map nào được thiết lập.";
  } else {
    for (const d of decays) {
      const end = new Date(d.start_time).getTime() + d.decay_days * 86400000;
      const leftMs = end - Date.now();
      const leftDays = Math.max(0, Math.floor(leftMs / 86400000));
      const leftHours = Math.max(0, Math.floor((leftMs % 86400000) / 3600000));

      let status;
      if (leftMs <= 0) status = "🔴 Đã hết hạn decay";
      else if (leftDays <= 1) status = `🟠 Còn ${leftDays} ngày ${leftHours} giờ`;
      else status = `🟢 Còn ${leftDays} ngày ${leftHours} giờ`;

      const mapTitle = d.map_label
        ? `${d.map_name} - ${d.map_label}`
        : d.map_name;

      desc += `> 🗺️ **${mapTitle}**\n> \`${status}\`\n\n`;
    }
  }

  return new EmbedBuilder()
    .setColor(0x1e1f22)
    .setTitle("🛡️ Check Decay - ASA Overview")
    .setDescription(desc)
    .setThumbnail(client.user.displayAvatarURL())
    .setTimestamp()
    .setFooter({
      text: "Brought to you by Ayaka • ASA System",
      iconURL: client.user.displayAvatarURL(),
    });
}
/**
 * Gửi thông báo decay chuyên nghiệp (ASA)
 * @param {object} client - Discord Client
 * @param {object} user - User Discord (người nhận)
 * @param {string} mapName - Tên map (vd: THEISLAND)
 * @param {string|null} mapLabel - Nhãn phụ (vd: 9999 hoặc Base A)
 * @param {number} daysLeft - Ngày còn lại
 * @param {number} hoursLeft - Giờ còn lại
 * @param {string} system - "ASA" hoặc "ASE"
 */
async function sendDecayAlertEmbed(client, user, mapName, mapLabel, daysLeft, hoursLeft, system = "ASA") {
  // 🎨 Màu và icon theo thời gian còn lại
  let color = 0xf1c40f; // cam (3 ngày)
  let icon = "⚠️";
  if (daysLeft <= 2) {
    color = 0xe74c3c; // đỏ (≤ 2 ngày)
    icon = "🚨";
  }
 
  const backgroundGifs = [
    "https://media.discordapp.net/attachments/.../asa1.gif",
    "https://media.discordapp.net/attachments/.../asa2.gif",
    "https://media.discordapp.net/attachments/.../asa3.gif",
    "https://media.discordapp.net/attachments/.../asa4.gif",
    "https://media.discordapp.net/attachments/.../asa5.gif",
  ];
  const randomImage = backgroundGifs[Math.floor(Math.random() * backgroundGifs.length)];

  // 🗺️ Hiển thị map
  const mapDisplay = mapLabel ? `${mapName} - ${mapLabel}` : mapName;

  // 🧱 Tạo embed thông báo
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} BASE DECAY WARNING (${system})`)
    .setDescription(
      `**<@${user.id}>**, base của bạn sắp decay!\n\n` +
      `🗺️ **Map:** ${mapDisplay}\n` +
      `⏳ **Thời gian còn lại:** ${daysLeft} ngày ${hoursLeft} giờ\n` +
      `📅 **Hệ thống:** ${system}\n\n` +
      `> Hãy vào game để reset decay trước khi hết hạn.`
    )
    .setThumbnail(user.displayAvatarURL())
    .setImage(randomImage) // ✅ ảnh ngẫu nhiên
    .setTimestamp()
    .setFooter({
      text: `Brought to you by Ayaka • ${system} Decay Monitor`,
      iconURL: client.user.displayAvatarURL(),
    });

  // 📢 Gửi tin nhắn đến kênh SPAM tương ứng
  const channelId = system === "ASA"
    ? process.env.NEWS_SPAM_ID_ASA   // ⚙️ ASA cảnh báo → kênh spam ASA
    : process.env.NEWS_SPAM_ID;      // ⚙️ ASE cảnh báo → kênh spam ASE

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return console.warn(`⚠️ Không tìm thấy channel thông báo cho ${system}`);

  await channel.send({ embeds: [embed] });
}



/* ==========================
   EXPORTS
========================== */
module.exports = {
  ASA_MAPS,
  ensureUserASA,
  addOrResetDecayASA,
  editDecayASA,
  deleteDecayASA,
  resetDecayASA,
  resetAllDecaysASA,
  getUserDecaysASA,
  buildDecayListEmbed,
  checkDecayRemindersASA,
  ensureOverviewMessage,
  updateDecayOverview,
};
