const http=require('http'),fs=require('fs'),path=require('path');
const ROOT = require('path').join(__dirname, '..', 'public');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.md':'text/markdown'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)){res.writeHead(403);return res.end();}
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);return res.end('404 '+p);} 
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});res.end(d);});
}).listen(process.env.PORT || 8099, () => console.log('static server on ' + (process.env.PORT || 8099)));
