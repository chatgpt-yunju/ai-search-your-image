const BASE_URL = 'https://api.yunjunet.cn';
const SECRET = process.env.INTERNAL_API_SECRET || '';

console.log('开始测试 AI API...');

const resp = await fetch(`${BASE_URL}/v1/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SECRET}`
  },
  body: JSON.stringify({
    model: 'llama-3.2-11b-vision-instruct',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Say "OK" in one word' }
      ]
    }],
    temperature: 0.3
  })
});

console.log('响应状态:', resp.status);
const json = await resp.json();
console.log('响应:', JSON.stringify(json).slice(0, 500));