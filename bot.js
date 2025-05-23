const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const TOKEN = '8098473364:AAGiVk1yz4eTzEYQDcQftd3AxUkX2VgOZPs';
const WEBHOOK_URL = 'https://4c75-82-118-25-84.ngrok-free.app'; // 请替换为你自己的 Webhook URL
const PORT = process.env.PORT || 3000;
const STORAGE_FILE = path.resolve(__dirname, 'storage.json');
const IMAGE_URL = 'https://i.postimg.cc/QCfW37K7/photo1.jpg';

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
let waitingChannel = {}; // 临时保存正在输入内容的频道

const proxyUrl = 'http://192.168.112.128:10808';  // 请替换为你自己的代理地址（如需要）

const bot = new TelegramBot(TOKEN, {
  webHook: { port: PORT, host: '0.0.0.0' },
  request: { proxy: proxyUrl }
});

bot.setWebHook(`${WEBHOOK_URL}/bot${TOKEN}`).then(() => {
  console.log('Webhook 设置成功');
}).catch(console.error);

const app = express();
app.use(bodyParser.json());
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

let timers = {};

// 开始自动发送，每个频道单独定时
function startAutoSend(userId) {
  if (!userData[userId]) return;
  userData[userId].autoSend = true;
  saveData(userData);

  const channels = Object.keys(userData[userId].channels);
  channels.forEach(channel => {
    const key = userId + '_' + channel;
    if (timers[key]) clearTimeout(timers[key]);

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

      try {
        await bot.sendPhoto(channel, IMAGE_URL, { caption: content, ...inlineKeyboard });
      } catch (e) {
        console.error(`发送失败到频道 ${channel}: ${e.message}`);
      }

      const intervalInMinutes = userData[userId].interval || 5;  // 默认5分钟
      let delay = intervalInMinutes * 60000; // 基础延迟时间，单位毫秒

      const randomVariation = Math.floor(Math.random() * 11) - 5;  // 随机值在-5到+5秒之间
      delay += randomVariation * 1000;  // 添加随机波动的延迟

      if (delay < 0) delay = 0;

      timers[key] = setTimeout(sendLoop, delay);  // 设置下一次发送的时间
    }

    sendLoop();
  });
}

// 停止自动发送，清理所有用户定时器
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

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const keyboard = [
    [{ text: '绑定频道', callback_data: 'bind_channel' }],
    [{ text: '删除频道', callback_data: 'delete_channel' }],
    [{ text: '编辑帖子', callback_data: 'edit_post' }],
    [{ text: '自动发送', callback_data: 'auto_send' }],
    [{ text: '停止发送', callback_data: 'stop_send' }],
  ];
  bot.sendMessage(chatId, '请选择操作：', { reply_markup: { inline_keyboard: keyboard } });
});

bot.on('callback_query', async (query) => {
  const userId = query.from.id.toString();
  const chatId = query.message.chat.id;
  const data = query.data;

  if (!userData[userId]) userData[userId] = { channels: {}, autoSend: false, interval: 5 };

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
        reply_markup: {
          inline_keyboard: buttons
        }
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
      reply_markup: {
        inline_keyboard: buttons
      }
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
  }
});

bot.on('message', (msg) => {
  const userId = msg.from.id.toString();
  const chatId = msg.chat.id;

  if (waitingChannel[userId] && waitingChannel[userId].mode === 'awaiting_channel') {
    const channelName = msg.text;
    if (!userData[userId].channels) {
      userData[userId].channels = {};
    }
    userData[userId].channels[channelName] = { content: '' };  // 初始化绑定频道的内容为空
    saveData(userData);

    bot.sendMessage(chatId, `频道 ${channelName} 已绑定！现在请输入该频道的帖子内容：`);
    waitingChannel[userId] = { mode: 'editing_content', channel: channelName };

  } else if (waitingChannel[userId] && waitingChannel[userId].mode === 'editing_content') {
    const content = msg.text;
    const channelName = waitingChannel[userId].channel;
    userData[userId].channels[channelName].content = content;
    saveData(userData);

    bot.sendMessage(chatId, `频道 ${channelName} 的帖子内容已设置！`);
    delete waitingChannel[userId];  // 清除等待状态
  }
});

restoreTimers();  // 启动时恢复定时器
