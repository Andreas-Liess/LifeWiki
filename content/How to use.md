# How to use

Write Markdown files. Push them to GitHub. The website updates by itself after a minute or two.

Any Markdown editor works: Obsidian, VS Code, Typora, Zettlr, a plain text editor.

## Add a page

1. Create a file in `content/`, e.g. `content/Physics/Energy.md`.
2. The file name is the page title. Folders become sections in the page list.

## Link to a page

| You write | You get |
| --- | --- |
| `[[Energy]]` | link to the page *Energy* |
| `[[Energy\|this idea]]` | same link, shows "this idea" |
| `[[Energy#History]]` | jumps to the heading *History* |
| `[[Physics/Energy]]` | use this when two pages have the same name |
| `[Energy](Physics/Energy.md)` | normal Markdown link, also works |

A red link means the page does not exist yet.

## Formulas

Inline: `$E = mc^2$` gives $E = mc^2$.

On its own line:

```
$$
\int_a^b f(x)\,dx = F(b) - F(a)
$$
```

gives

$$
\int_a^b f(x)\,dx = F(b) - F(a)
$$

## Images

1. Put the image in `content/attachments/`.
2. Write `![[example.svg]]`. Set the width with `![[example.svg|200]]`.

Normal Markdown also works: `![A circle](attachments/example.svg)`.

![[example.svg|200]]

## Add your changes to the repository

Once: download the repository.

```
git clone https://github.com/andreas-liess/lifewiki.git
```

Every time you changed something, inside the `lifewiki` folder:

```
git add .
git commit -m "What I changed"
git push
```

Get the newest version from the others first: `git pull`.

## Comment on a page

At the bottom of each page: **Comment on GitHub**. It opens a GitHub issue for that page.
