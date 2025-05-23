const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api'); 
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');  // 需要安装 node-fetch@2，npm install node-fetch@2

const TOKEN = '8098473364:AAGiVk1yz4eTzEYQDcQftd3AxUkX2VgOZPs';
const PORT = process.env.PORT || 3000;
const STORAGE_FILE = path.resolve(__dirname, 'storage.json');
const IMAGE_URL = 'https://i.postimg.cc/QCfW37K7/photo1.jpg';
const DEFAULT_INTERVAL = 5; // 默认5分钟

function loadData() {
  if (!fs.existsSync(STORAGE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STORAGE_FILE));
  } catch (e) {
    console.error('读取数据失败:', e);
    return {};
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('保存数据失败:', e);
  }
}

let userData = loadData();
let waitingChannel = {};
let timers = {};
const sendQueue = [];
let isSending = false;

const app = express();
app.use(bodyParser.json());
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

let bot;

async function processSendQueue() {
  if (isSending || sendQueue.length === 0) return;
  isSending = true;

  while (sendQueue.length > 0) {
    const { chatId, photoUrl, options } = sendQueue.shift();
    try {
      await bot.sendPhoto(chatId, photoUrl, options);
    } catch (e) {
      console.error(`发送失败到 ${chatId}，任务已丢弃:`, e.message);
      continue;
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  isSending = false;
}

function enqueueSend(chatId, photoUrl, options) {
  sendQueue.push({ chatId, photoUrl, options });
  processSendQueue();
}

function startAutoSend(userId) {
  if (!userData[userId]) return;
  userData[userId].autoSend = true;
  saveData(userData);

  const channels = Object.keys(userData[userId].channels);

  channels.forEach(channel => {
    const key = userId + '_' + channel;
    if (timers[key]) {
      clearTimeout(timers[key]);
      delete timers[key];
    }
  });

  channels.forEach(channel => {
    const key = userId + '_' + channel;

    async function sendLoop() {
      if (!userData[userId] || !userData[userId].autoSend) {
        clearTimeout(timers[key]);
        delete timers[key];
        return;
      }
      if (!userData[userId].channels[channel] || !userData[userId].channels[channel].content) {
        clearTimeout(timers[key]);
        delete timers[key];
        return;
      }

      const content = userData[userId].channels[channel].content;
      const inlineKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: '更多精品资源合集', url: 'https://t.me/addlist/xwKEL2hgvv5mYTQ0' }],
            [{ text: '精品资源搜索群', url: 'https://t.me/hgddhvxx' }]
          ]
        }
      };

      enqueueSend(channel, IMAGE_URL, { caption: content, ...inlineKeyboard });

      let intervalInMinutes =
        userData[userId].channels[channel]?.interval ??
        userData[userId].interval ??
        DEFAULT_INTERVAL;

      intervalInMinutes = Math.max(intervalInMinutes, 1);

      let delay = intervalInMinutes * 60000;
      const randomVariation = Math.floor(Math.random() * 11) - 5; // ±5秒
      delay += randomVariation * 1000;
      if (delay < 60000) delay = 60000;

      timers[key] = setTimeout(sendLoop, delay);
    }

    timers[key] = setTimeout(sendLoop, 5000);
  });
}

function stopAutoSend(userId) {
  if (!userData[userId]) return;
  userData[userId].autoSend = false;
  saveData(userData);

  const channels = Object.keys(userData[userId].channels);
  channels.forEach(channel => {
    const key = userId + '_' + channel;
    if (timers[key]) {
      clearTimeout(timers[key]);
      delete timers[key];
    }
  });
}

function restoreTimers() {
  for (const userId in userData) {
    if (userData[userId].autoSend) startAutoSend(userId);
  }
}

function setupBot() {
  bot = new TelegramBot(TOKEN, { polling: true });

  bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, error.message);
    // 删除409冲突处理
  });

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const keyboard = [
      [{ text: '绑定频道', callback_data: 'bind_channel' }],
      [{ text: '删除频道', callback_data: 'delete_channel' }],
      [{ text: '编辑帖子', callback_data: 'edit_post' }],
      [{ text: '自动发送', callback_data: 'auto_send' }],
      [{ text: '停止发送', callback_data: 'stop_send' }],
      [{ text: '设置频道间隔', callback_data: 'set_channel_interval' }],
    ];
    bot.sendMessage(chatId, '请选择操作：', { reply_markup: { inline_keyboard: keyboard } });
  });

  bot.on('callback_query', async (query) => {
    const userId = query.from.id.toString();
    const chatId = query.message.chat.id;
    const data = query.data;

    if (!userData[userId]) userData[userId] = { channels: {}, autoSend: false, interval: DEFAULT_INTERVAL };

    if (data === 'bind_channel') {
      bot.sendMessage(chatId, '请输入频道用户名（如 @xxx）：');
      waitingChannel[userId] = { mode: 'awaiting_channel' };

    } else if (data === 'delete_channel') {
      const channels = Object.keys(userData[userId].channels);
      if (channels.length === 0) {
        bot.sendMessage(chatId, '你尚未绑定任何频道。');
      } else {
        const buttons = channels.map(ch => ([{ text: ch, callback_data: `del_${ch}` }]));
        await bot.sendMessage(chatId, '请选择要删除的频道：', {
          reply_markup: { inline_keyboard: buttons }
        });
      }

    } else if (data.startsWith('del_')) {
      const channelToDelete = data.slice(4);
      if (userData[userId].channels[channelToDelete]) {
        delete userData[userId].channels[channelToDelete];
        saveData(userData);
        bot.editMessageText(`频道 ${channelToDelete} 已删除。`, {
          chat_id: chatId,
          message_id: query.message.message_id
        });
      } else {
        bot.answerCallbackQuery(query.id, { text: '频道未找到或已删除。', show_alert: true });
      }

    } else if (data === 'edit_post') {
      const channels = Object.keys(userData[userId].channels);
      if (channels.length === 0) {
        bot.editMessageText('你还未绑定任何频道。', {
          chat_id: chatId,
          message_id: query.message.message_id
        });
        return;
      }
      const buttons = channels.map(ch => ([{ text: ch, callback_data: `edit_${ch}` }]));
      await bot.sendMessage(chatId, '请选择要编辑的频道：', {
        reply_markup: { inline_keyboard: buttons }
      });

    } else if (data.startsWith('edit_')) {
      const channelToEdit = data.slice(5);
      if (userData[userId].channels[channelToEdit]) {
        bot.sendMessage(chatId, `请输入新的帖子内容来编辑频道 ${channelToEdit} 的帖子：`);
        waitingChannel[userId] = { mode: 'editing_content', channel: channelToEdit };
      }

    } else if (data === 'auto_send') {
      const channels = Object.keys(userData[userId].channels);
      if (channels.length === 0) {
        bot.editMessageText('你还未绑定任何频道。', {
          chat_id: chatId,
          message_id: query.message.message_id
        });
        return;
      }
      bot.sendMessage(chatId, '请选择发送间隔（1-5分钟）：', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '1分钟', callback_data: 'set_interval_1' }],
            [{ text: '2分钟', callback_data: 'set_interval_2' }],
            [{ text: '3分钟', callback_data: 'set_interval_3' }],
            [{ text: '4分钟', callback_data: 'set_interval_4' }],
            [{ text: '5分钟', callback_data: 'set_interval_5' }],
          ]
        }
      });

    } else if (data.startsWith('set_interval_')) {
      const interval = parseInt(data.split('_')[2], 10);
      userData[userId].interval = interval;
      saveData(userData);
      bot.sendMessage(chatId, `发送间隔已设置为 ${interval} 分钟。`);
      startAutoSend(userId);

    } else if (data === 'stop_send') {
      stopAutoSend(userId);
      bot.sendMessage(chatId, '自动发送已停止。');

    } else if (data === 'set_channel_interval') {
      const channels = Object.keys(userData[userId].channels);
      if (channels.length === 0) {
        bot.sendMessage(chatId, '你还未绑定任何频道。');
        return;
      }
      const buttons = channels.map(ch => ([{ text: ch, callback_data: `set_int_channel_${ch}` }]));
      bot.sendMessage(chatId, '请选择要设置间隔的频道：', {
        reply_markup: { inline_keyboard: buttons }
      });

    } else if (data.startsWith('set_int_channel_')) {
      const channelToSet = data.slice('set_int_channel_'.length);
      if (!userData[userId].channels[channelToSet]) {
        bot.sendMessage(chatId, '频道不存在。');
        return;
      }
      bot.sendMessage(chatId, `请选择频道 ${channelToSet} 的发送间隔（1-5分钟）：`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '1分钟', callback_data: `set_channel_interval_value_${channelToSet}_1` }],
            [{ text: '2分钟', callback_data: `set_channel_interval_value_${channelToSet}_2` }],
            [{ text: '3分钟', callback_data: `set_channel_interval_value_${channelToSet}_3` }],
            [{ text: '4分钟', callback_data: `set_channel_interval_value_${channelToSet}_4` }],
            [{ text: '5分钟', callback_data: `set_channel_interval_value_${channelToSet}_5` }],
          ]
        }
      });

    } else if (data.startsWith('set_channel_interval_value_')) {
      const parts = data.split('_');
      const channelName = parts.slice(4, parts.length - 1).join('_');
      const interval = parseInt(parts[parts.length - 1], 10);

      if (!userData[userId].channels[channelName]) {
        bot.sendMessage(chatId, '频道不存在。');
        return;
      }

      userData[userId].channels[channelName].interval = interval;
      saveData(userData);

      bot.sendMessage(chatId, `频道 ${channelName} 的发送间隔已设置为 ${interval} 分钟。`);
      if (userData[userId].autoSend) startAutoSend(userId);
    }
    bot.answerCallbackQuery(query.id);
  });

  bot.on('message', (msg) => {
    const userId = msg.from.id.toString();
    const chatId = msg.chat.id;
    if (!userData[userId]) userData[userId] = { channels: {}, autoSend: false, interval: DEFAULT_INTERVAL };

    if (waitingChannel[userId]) {
      const { mode, channel } = waitingChannel[userId];

      if (mode === 'awaiting_channel') {
        const channelName = msg.text.trim();
        if (!channelName.startsWith('@')) {
          bot.sendMessage(chatId, '频道用户名必须以 @ 开头，请重新输入：');
          return;
        }
        userData[userId].channels[channelName] = { content: '默认帖子内容', interval: DEFAULT_INTERVAL };
        saveData(userData);
        bot.sendMessage(chatId, `频道 ${channelName} 已绑定。请输入该频道的帖子内容：`);
        waitingChannel[userId] = { mode: 'editing_content', channel: channelName };

      } else if (mode === 'editing_content') {
        if (!channel || !userData[userId].channels[channel]) {
          bot.sendMessage(chatId, '频道未绑定或已删除，请重新操作。');
          delete waitingChannel[userId];
          return;
        }
        userData[userId].channels[channel].content = msg.text;
        saveData(userData);
        bot.sendMessage(chatId, `频道 ${channel} 的帖子内容已更新。`);
        delete waitingChannel[userId];
      }
    }
  });

  restoreTimers();
}

setupBot();
