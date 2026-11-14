const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const jobs = JSON.parse(process.argv[2]);
  for (const [src, out, w, h, scale] of jobs) {
    await p.setViewportSize({ width: w, height: h });
    const isHtml = src.endsWith('.html');
    await p.goto('file://' + src); await p.waitForTimeout(isHtml ? 600 : 100);
    await p.screenshot({ path: out, omitBackground: !isHtml, clip: {x:0,y:0,width:w,height:h} });
  }
  await b.close();
})();
