# Nexus AI

Copyright (c) 2026 Joshua Almeida

Nexus AI is a Claude-style assistant that runs in the browser. It is a static site made of plain HTML, CSS, and JavaScript, with no build step and no secret keys stored in the repository.

Open `index.html` in a web browser to use it, or serve this folder with any static file server. After the site files are on the `main` branch, you can also publish it with GitHub Pages: in the repository Settings, open Pages, set Source to "Deploy from a branch", choose `main` and the `/ (root)` folder, and save. The site will then be at https://fitzyracing1.github.io/nexus-chat/ . Pages is not turned on yet. If you clone this repository and `index.html` is not on the branch you checked out, switch to `feat/nexus-v0`.

The chat page is a clean conversation view. If you have not entered an API key, Nexus AI runs in a clearly labeled offline echo/demo mode and answers from loaded prompt and answer pairs. To talk to a real model, open Settings and paste your own API key. The key is stored only in this browser's localStorage and is sent only to the provider URL you configure. You can point it at an OpenAI-compatible endpoint by setting a base URL and model, for example `https://api.x.ai/v1` with a Grok model, or use the Anthropic-compatible option for Anthropic's Messages API. Many providers block browser requests because of CORS, so a key may not work from this page even when it is valid; demo mode always works without a network call.

Pairs load lets you import matched prompt and answer pairs from a JSON or CSV file. A sample file is included at `data/pairs.json`. JSON should be a list of objects with `prompt` and `answer` fields (`question`/`answer` and `input`/`output` are also accepted). CSV should have a header row such as `prompt,answer`. Loaded pairs are used as few-shot context when a model is called, and as the answers in offline demo mode by simple matching against the prompt text.

Circle the drain is a campaign-window panel. You can create a window with a name, a start date, an end date, and an audience of users or developers, then log signups for that window. Counts are shown for each window, and a loop view shows the idea that developers build, users join, and more developers follow. Campaign data is stored in localStorage and can be exported or imported as JSON.

Nexus AI is licensed under the MIT License.
