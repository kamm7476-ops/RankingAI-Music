name: Global News Auto Update

on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

# 👇 로봇에게 파일 쓰기 절대 권한을 부여하는 강력한 명찰입니다!
permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Use Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Update News Data
        run: node update_news.js
      - name: Commit and Push
        run: |
          git config --global user.name "NewsBot"
          git config --global user.email "bot@rankingaimusic.com"
          git add news-data.json
          git commit -m "Automated News Update" || exit 0
          git push