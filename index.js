const { Plugin } = require("siyuan");
const clientApi = require("siyuan");
const path = globalThis.require('path')
const fs = globalThis.require('fs')
const { dialog } = globalThis.require('@electron/remote');
let glob,MagicString
class importHelper extends Plugin {
    onload() {
        console.log(this)
        this.创建顶栏按钮()
        this.初始化环境变量()
        this.加载事件()
        this.加载依赖()
    }
    初始化环境变量() {
        this.selfURL = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/plugins/${this.name}/`;
        this.dataPath = `/data/storage/petal/${this.name}`
        this.tempPath = `/temp/ccTemp/${this.name}/`
        this.publicPath = `/data/public`
        this.selfPath = `/data/plugins/${this.name}`
        this.localPath = path.join(window.siyuan.config.system.workspaceDir, 'data', 'plugins', this.name)
        }
    加载事件(){
        this.顶栏按钮.addEventListener(
            'click', () => {
                dialog.showOpenDialog({
                    properties: ['openDirectory']
                }).then(result => {
                    if (!result.canceled) {
                        console.log(path)
                        const folderPath = result.filePaths[0]; // 获取选中的文件夹路径
                        const normalizedPath = path.normalize(folderPath).replace(/\\/g,'/');
                        const targetFolderPath = path.join(normalizedPath, '..', path.basename(normalizedPath) + '_prepared');
                        if (!fs.existsSync(targetFolderPath)) {
                            fs.mkdirSync(targetFolderPath);
                        }
                        let list = glob.sync("**", { stats: true, cwd: normalizedPath });
                        let logFilePath = path.join(targetFolderPath, `prepare${Date.now()}.log.md`);
                        let logFile = fs.createWriteStream(logFilePath, { flags: 'a' });
                        for (let i = 0, len = list.length; i < len; i++){
                            let item = list[i];
                            item.filePath = path.join(normalizedPath, item.path);
                            item.targetFilePath = path.join(targetFolderPath, item.path);
                        }
                        for (let i = 0, len = list.length; i < len; i++) {
                            let item = list[i];
                            item.filePath = path.join(normalizedPath, item.path);
                            let targetFilePath = path.join(targetFolderPath, item.path);
                            item.targetFilePath=targetFilePath
                            try {
                                if (item.name.endsWith(".md")) {
                                    item.markdown = fs.readFileSync(item.filePath, "utf-8");
                                    if (item.markdown && item.markdown.length) {
                                        item = 解析文本(item, '', list);
                                        let targetDir = path.dirname(targetFilePath);
                                        if (!fs.existsSync(targetDir)) {
                                            fs.mkdirSync(targetDir, { recursive: true });
                                        }
                                        fs.writeFileSync(targetFilePath, item["markdown_prepared"]);
                                    }
                                } else {
                                    let targetDir = path.dirname(targetFilePath);
                                    if (!fs.existsSync(targetDir)) {
                                        fs.mkdirSync(targetDir, { recursive: true });
                                    }
                                    fs.copyFileSync(item.filePath, targetFilePath);
                                }
                                logFile.write(`Processed file: ${item.filePath}\n`);
                            } catch (err) {
                                console.log(err)
                                logFile.write(`Error processing file: ${item.filePath}\n`,err,err.stack);
                                logFile.write(`Error message: ${err.message}\n`,err,err.stack);
                            }
                        }
                        logFile.end();
                    }
                }).catch(err => {
                    console.error(err);
                });
            }
        )
    }
    加载依赖(){
        glob = globalThis.require(path.join(this.localPath,'node_modules','fast-glob'))
        MagicString = globalThis.require(path.join(this.localPath,'node_modules','magic-string'))
    }
    创建顶栏按钮() {
        this.顶栏按钮 = this.addTopBar(
            {
                icon: 'iconDownload',
                title: '选择文件夹开始处理',
                position: 'right',
            }
        )
    }
}
module.exports = importHelper
function 读取Markdown文本(item) {
    let markdown = fs.readFileSync(item.filePath, "utf-8");
    return markdown;
}
function 解析文本(item, flag, list) {
    let markdown = 读取Markdown文本(item);
    item["lines"] = 解析文本链接(markdown,flag, list,item);
    item["markdown_prepared"] = item["lines"].map(item => {return item.markdown}).join('\n');
    console.log(item)
    return item;
}
function 解析文本链接(markdown,flag, list,item) {
    let lines = markdown.split(/\r\n\r\n|\n\n|\r\r/);
    for (let i = 0, len = lines.length; i < len; i++) {
        lines[i] = 解析一行文本(lines[i], list,item);
    }
    return lines;
}
function 解析一行文本(line, list, item) {
    let links = [];
    let magicline = new MagicString(line);

    if (!line) {
        return {
            markdown: magicline.toString(),
            links: links,
        };
    }
    //这里之后会提供链接样式的配置,文件路径的匹配使用needTrans进行判断
    //https://github.com/leolee9086/importHelper/pull/2
    const regexWikiGlobal = /\[\[([^\]]*)\]\]/g;
    let wikiMatches = line.match(regexWikiGlobal);

    if (!wikiMatches) {
        return {
            markdown: magicline.toString(),
            links: links,
        };
    }
    wikiMatches.forEach(wikilink => {
        let {start, end, alias, name, fileName, query, path, needTrans} = parseWikiLink(wikilink, line, list,item.targetFilePath);
        if (needTrans) {
            links.push({
                href:path,
                query:query,
                hrefName: fileName,
                alias: alias
            });
            magicline.overwrite(start, end, `[${alias}](${path}${query})`);
        }
    });
    return {
        markdown: magicline.toString(),
        links: links,
    };
}

function parseWikiLink(wikilink, line, list, currentFilePath) {
    let needTrans = true;
    let start = line.indexOf(wikilink);
    let end = start + wikilink.length;
    let alias = wikilink.split("|")[1];
    let name = wikilink.split("|")[0];
    if (name) {
        name = name.substring(2);
    }
    if (alias) {
        alias = alias.substring(0, alias.length - 2);
    }
    if (!alias) {
        name = name.substring(0, name.length - 2);
        alias = name;
    }
    name = name.replace("#", "?title=");
    name = name.replace("^", "?id=");
    let fileName = name.split("?")[0];
    let query = name.replace(fileName, "");
    if ((fileName.indexOf("\.") < 0)) {
        fileName = fileName + '.md';
        // 忽略markdown文件翻译
        needTrans = false;
    }
    fileName = fileName;
    query = query;
    let linktarget = list.find((e) => {
        return e.path == fileName;
    });
    if (!linktarget) {
        linktarget = list.find((e) => {
            return e.name == fileName;
        });
    }
    let _path = linktarget ? linktarget.targetFilePath : fileName;
    // Convert the path to a relative path
    _path = path.relative(path.dirname(currentFilePath), _path);

    return {start, end, alias, name, fileName, query, path:_path, needTrans};
}
