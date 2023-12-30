const request = require("request");
const cheerio = require("cheerio");
const moment = require("moment");
const express = require("express");

const reset = "\x1b[0m";
const green = "\x1b[32m";
const red = "\x1b[31m";

const raindropApiBaseUrl = "https://api.raindrop.io/rest/v1";
const raindropApiToken = process.env.raindropApiToken;
const raindropLists = process.env.raindropListIds.split("|").map(Number);

let currentListIndex = 0;
let pageNr = 0;

function fetchRaindrops() {
  if (currentListIndex >= raindropLists.length) {
    currentListIndex = 0;
    setTimeout(fetchRaindrops, 300000); // Wait for 5 minutes before checking the first list again
    return;
  }

  const listId = raindropLists[currentListIndex];

  const options = {
    url: `${raindropApiBaseUrl}/raindrops/${listId}?page=${pageNr}&perpage=50`,
    headers: {
      Authorization: `Bearer ${raindropApiToken}`,
    },
  };

  request(options, (error, response, body) => {
    if (error) {
      console.error(error);
      currentListIndex++;
      fetchRaindrops(); // Move to the next list
      return;
    }

    const raindropsResponse = JSON.parse(body);
    const raindrops = raindropsResponse.items;
    const links = raindrops.map(({ title, link, domain, _id, important }) => ({ title, url: link, domain, raindropId: _id, important }));

    let currentIndex = 0;

    function loadPage() {
      if (currentIndex >= links.length) {
        currentIndex = 0;
        const totalPages = Math.ceil(raindropsResponse.count / 50);
        if (pageNr < totalPages) {
          pageNr++;
        } else {
          pageNr = 0;
          currentListIndex++;
        }
        fetchRaindrops(); // Move to the next list
        return;
      }

      const { url, title, domain, raindropId, important } = links[currentIndex];

      if (!important) {
        request(url, (error, response, body) => {
          if (error) {
            if (error.code === 'ENOTFOUND') {
              console.error(`${currentIndex + 1}. ${red}Hostname not found for ${url}. Skipping...`);
              currentIndex++;
              setTimeout(loadPage, 5000);
              return;
            } else {
              console.error(error);
              currentIndex++;
              setTimeout(loadPage, 5000);
              return;
            }
          }

          const $ = cheerio.load(body);

          let nextChLink = $(".next_page, .ch-next-btn, .next-post, .navi-change-chapter-btn-next").attr("href");

          if (!nextChLink) {
            $("script").each((index, element) => {
              const scriptContent = $(element).html();
              let nextChMatch = scriptContent.match(/var next_ch = "(.*?)";/) || scriptContent.match(/"nextUrl"\s*:\s*"([^"]*)"/);

              if (nextChMatch) {
                nextChLink = nextChMatch[1].replace(/\\\//g, '/');
              }
            });
          }

          if (isValidLink(nextChLink)) {
            console.log(`${currentIndex + 1}. ${green}${url}${reset}`);
            markBookmarkImportant(raindropId);
          } else {
            console.log(`${currentIndex + 1}. ${red}${url}${reset}`);
          }

          currentIndex++;
          setTimeout(loadPage, 5000);
        });
      } else {
        currentIndex++;
        setTimeout(loadPage, 5000);
      }
    }

    loadPage();
  });
}

function markBookmarkImportant(raindropId) {
  const options = {
    url: `${raindropApiBaseUrl}/raindrop/${raindropId}`,
    method: "PUT",
    headers: {
      Authorization: `Bearer ${raindropApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      important: true,
    }),
  };

  request(options, (error, response, body) => {
    if (error) {
      console.error(`Error marking bookmark as important: ${error}`);
      return;
    }

    console.log(`Bookmark with raindropId ${raindropId} marked as important.`);
  });
}

function isValidLink(link) {
  return link && link !== "#" && link !== "#/next/";
}

function startServer() {
  const server = express();
  server.all("/", (req, res) => {
    res.send("Result: [OK].");
  });
  server.use("/ping", (req, res) => {
    res.send(new Date());
  });
  server.listen(3000, () => {
    console.log(`Server is now ready! | ${moment().format("DD.MM.YYYY h:mm:ss")}`);
  });
}

fetchRaindrops();
startServer();
