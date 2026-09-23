# Live Wiki

A simple wiki made from Markdown files.

```
content/  (your .md files)  →  git push  →  Vercel builds the site  →  wiki online
```

No server, no database. Every page is a Markdown file in `content/`.

## Write

- Use any Markdown editor: Obsidian, VS Code, Typora, Zettlr, a text editor.
- One file = one page. Folders = sections.
- Links: `[[Page]]`, `[[Page|text]]`, `[[Page#Heading]]`, `[[Folder/Page]]`, or `[text](Folder/Page.md)`.
- Formulas: `$x^2$` or a `$$ … $$` block.
- Images: put them in `content/attachments/`, write `![[image.png]]` or `![[image.png|300]]`.

Full guide with examples: [content/How to use.md](content/How%20to%20use.md) (also on the website).

## Publish

```
git add .
git commit -m "What I changed"
git push
```

## Setup (once, for the owner)

1. On [vercel.com](https://vercel.com): **Add New → Project**, pick this repository, click **Deploy**.
   No settings needed – `vercel.json` has them.
2. Optional: change the name or repository in `site.config.json`.

## Preview on your own computer (optional)

Needs [Node.js](https://nodejs.org).

```
npm install
npm run dev      # http://localhost:3000
npm test         # checks links, formulas, images with a test wiki
```

The build lists broken links and links that match several pages.

## How links find their page

Same rules as Obsidian:

1. A file in the same folder as the current page.
2. Otherwise a full path from `content/`, e.g. `[[Mathematik/Maßtheorie]]`.
3. Otherwise any file with that name. If there are several, the one with the shortest path wins.

Upper and lower case do not matter. If two pages share a name, write the folder too.

## Files

```
app/build.js          reads content/, writes dist/
app/lib/resolve.js    finds the page a link points to
app/lib/markdown.js   Markdown → HTML (links, images, formulas)
app/lib/layout.js     page frame: header, page list, article
app/assets/           style.css, wiki.js (page filter, phone menu)
content/              the wiki
test/                 tests + a small test wiki
```
