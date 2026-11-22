# 日本語ハブ

One home for a set of personal Japanese-learning tools. Static pages (no build step) plus a few background jobs.
The data lives in a separate private repo; this repo holds code only.

```
index.html, home.js     今日: everything in use, today's articles, notes, station lines
library/                every media type from the library sheet, with status write-back
articles/               the daily five
notebook/               one place to read every note; opt-in AI
settings/               tokens and manual sync
lib/                    shared code: page helpers, data access, library model, notes, AI call
jobs/                   Python jobs run by GitHub Actions (snapshot, outbox, steam, articles) + tests
deploy/data-repo/       workflow files to copy into the private data repo
tools/                  local dev server and sample-data builder
```

## Run locally

```
py -3.9 tools/dev_server.py --port 8765
```

Open http://localhost:8765/jphub/ . The dev server stands in for GitHub Pages, the data repo and the Actions, using the sample data folder next to this one.

## Test

```
py -3.9 -m unittest discover -s jobs/tests
```

## Rules this code keeps

- Pages build the DOM with `h()` and never insert data as HTML. Every page ships a Content-Security-Policy.
- No key or token is in this repo. Service keys live in the data repo's Actions secrets; device tokens are typed into 設定.
- Jobs treat requests from the apps as data: only the Status and Rating cells of known tabs, and an article's Read box, can change.
- Storage names all start with `jphub`, so this app never touches Gyokan's or Kikitori's data on the shared origin.
