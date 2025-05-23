const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');

// 设置代理服务器的地址，确保这里有 host 和 port
const proxyUrl = 'http://192.168.1.38:7897';  // 请替换成你的实际代理服务器地址
const agent = new HttpsProxyAgent(proxyUrl);

// 配置 Telegram Bot Token
const token = '7746190847:AAH6FZfzRoQTwN_3hodKViNnRSqElgCPNk8';
const bot = new TelegramBot(token, { polling: true });

// 用户数据存储
let userData = {};

// 频道设置
const CHANNEL_USERNAME = '@jingshengxiaomei3';
const IMAGE_URL = 'https://i.postimg.cc/QCfW37K7/photo1.jpg';

// 启动命令
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const keyboard = [
    [
      { text: '绑定频道', callback_data: 'bind_channel' },
      { text: '添加帖子', callback_data: 'add_post' },
    ],
    [
      { text: '自动发送', callback_data: 'auto_send' },
      { text: '关闭自动发送', callback_data: 'stop_send' },
    ]
  ];
  const replyMarkup = { reply_markup: { inline_keyboard: keyboard } };
  bot.sendMessage(chatId, '你好！我是一个 Telegram 机器人。\n请选择你想要的操作：', replyMarkup);
});

// 处理按钮点击事件
bot.on('callback_query', async (query) => {
  const userId = query.from.id;
  const choice = query.data;
  const chatId = query.message.chat.id;

  if (choice === 'bind_channel') {
    bot.editMessageText('你选择了“绑定频道”。\n你已成功绑定频道：@jingshengxiaomei3。', { chat_id: chatId, message_id: query.message.message_id });
  } else if (choice === 'add_post') {
    bot.editMessageText('你选择了“添加帖子”。\n请发送你要添加的帖子内容（可以包含文本和图片）。', { chat_id: chatId, message_id: query.message.message_id });
  } else if (choice === 'auto_send') {
    if (!userData[userId] || !userData[userId].content) {
      bot.editMessageText('你还没有设置帖子内容。请先添加帖子内容。', { chat_id: chatId, message_id: query.message.message_id });
      return;
    }

    const postContent = userData[userId].content;
    const mediaFile = userData[userId].media;

    const replyMarkup = {
      inline_keyboard: [
        [{ text: '更多精品资源合集', url: 'https://t.me/addlist/xwKEL2hgvv5mYTQ0' }],
        [{ text: '精品资源搜索群', url: 'https://t.me/hgddhvxx' }]
      ]
    };

    const sendPost = async () => {
      try {
        if (mediaFile) {
          await bot.sendPhoto(CHANNEL_USERNAME, mediaFile, { caption: postContent, reply_markup: replyMarkup });
        } else {
          await bot.sendPhoto(CHANNEL_USERNAME, IMAGE_URL, { caption: postContent, reply_markup: replyMarkup });
        }
      } catch (e) {
        console.error(`发送帖子失败：${e.message}`);
      }
    };

    const repeatSend = () => {
      const interval = Math.floor(Math.random() * (50 - 20 + 1)) + 20;
      userData[userId].autoSendInterval = setInterval(() => {
        if (!userData[userId] || userData[userId].autoSend === false) {
          clearInterval(userData[userId].autoSendInterval);
        } else {
          sendPost();
        }
      }, interval * 1000);
    };

    userData[userId] = { content: postContent, autoSend: true };
    bot.editMessageText('自动发送已开始！将在每 20 到 50 秒间隔自动发送帖子。', { chat_id: chatId, message_id: query.message.message_id });

    repeatSend();
  } else if (choice === 'stop_send') {
    if (userData[userId] && userData[userId].autoSendInterval) {
      clearInterval(userData[userId].autoSendInterval);
      userData[userId].autoSend = false;
    }
    bot.editMessageText('自动发送已停止。', { chat_id: chatId, message_id: query.message.message_id });
  }
});

// 处理添加帖子内容
bot.on('message', (msg) => {
  const userId = msg.from.id;
  if (msg.text && !msg.text.startsWith('/')) {
    const postContent = msg.text;
    userData[userId] = { content: postContent, autoSend: false };
    bot.sendMessage(userId, "成功保存帖子内容！点击自动发送将把它发送到指定的频道。");
  }
});

// 帮助命令
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '这是一个简单的 Telegram 机器人。可以使用以下命令：\n/start - 欢迎信息\n/help - 获取帮助');
});
