# TabMark-你的书签,值得被重新看见

## 项目网站: www.ainewtab.app

TabMark 将收藏夹变成新标签页，让你收藏的书签一目了然、整洁高效，快速直达你最需要的网站和资源。搭配智能 AI 搜索，更快找到你想要的答案。支持 Chrome 和 Edge。

![MacBook Air 13_ - 5@1x](https://github.com/user-attachments/assets/bb4f9996-902c-4b69-8a7f-4c2b2e219ffc)

## 请注意由于chrome 商店新的条款要求，拓展不允许同时修改新标签页和搜索功能，故chrome 商店版本暂时无法更新

- chrome 商店版本：1.243（实际为 1.241 版本，为 1.242 版本回滚）
- Edge版本：1.245 审核中
- GitHub 版本：1.245

## 开发与打包

需要 Node.js 20.19+ 或 22.12+。首次执行 `npm install` 后：

- `npm run dev`：使用 Vite 8 监听构建，Chrome/Edge 在“加载已解压的扩展程序”中选择 `dist/`。
- `npm run build`：生成可加载的 MV3 扩展目录 `dist/`。
- `npm run package`：构建后生成 `release/TabMark-Bookmark-New-Tab-1.245.zip`。
- `npm run typecheck`：使用 TypeScript 7 检查 Vite 配置。

现有扩展的经典脚本加载顺序和 Manifest 路径会原样保留；Vite 负责监听、输出和打包，避免改变已发布扩展的运行行为。

## 主要功能

**将书签设置为新标签页**：安装拓展后，可以选择常用的书签文件夹。右键点击，选择"将书签设为主页"，即可在新标签页中快速打开选中路径书签文件夹。支持书签拖拽排序，侧边栏树状文件夹视图让你直观管理书签文件夹，快速找到所需内容；

**丰富的书签上下文菜单**：支持复制书签url、生成二维码、一键打开书签文件夹内所有书签；

**AI智能搜索**：在新标签页直接使用 AI 搜索，快速访问豆包、Kimi、秘塔、felo、ChatGPT 等，还支持 Google、Bing 等经典搜索引擎；支持书签、历史记录的搜索；

**对比搜索**：在新标签页搜索框按下 Cmd/Ctrl + Enter，可以一键在所有搜索引擎中查找同一内容并对比不同结果；

**自定义新标签页**：支持暗黑模式和壁纸随心换：提供 10 张精选预设壁纸，支持本地上传，个性化新标签页；

**浏览器功能快捷方式**：展示浏览器历史记录、下载、密码管理、拓展管理的快捷链接；


### 使用教程
https://cooing-loganberry-b74.notion.site/TabMark-Bookmark-New-Tab-7a083a74f84e4bb48345e389c1e53717

### 反馈建议

**微信交流群**

<img src="https://raw.githubusercontent.com/Alanrk/blogimg/main/IMG_4528.JPG" width="300" />

邮箱：hello@ainewtab.app
