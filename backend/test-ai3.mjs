import fs from 'fs';

const imgPath = '/mnt/win-aippt/imgbed/images/2026/03/dad35006ce08.webp';

console.log('图片路径:', imgPath, fs.existsSync(imgPath));

const BASE_URL = 'https://api.yunjunet.cn';
const SECRET = process.env.INTERNAL_API_SECRET || '';

const base64 = fs.readFileSync(imgPath).toString('base64');
console.log('图片 base64 长度:', base64.length);

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
        { type: 'image_url', image_url: { url: `data:image/webp;base64,${base64}` } },
        { type: 'text', text: '分析图片，JSON格式返回：{"tags":["标签1","标签2"...],"description":"描述"}。tags最多8个每个2-4字，description不超过50字，只返回JSON。' }
      ]
    }],
    temperature: 0.3
  })
});

console.log('响应状态:', resp.status);
const json = await resp.json();
const content = json.choices?.[0]?.message?.content || '';
console.log('AI 响应:', content.slice(0, 500));

const match = content.match(/\{[\s\S]*\}/);
if (match) {
  const result = JSON.parse(match[0]);
  console.log('解析结果:', result);
}