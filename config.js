// Where is the game server?
//
// ""  (empty)  -> the page and the server are on the same address (running node server.js
//                 locally, or on a host that runs Node). Nothing to change.
//
// To put this page on a website that cannot run Node (for example lasertanks.gt.tc),
// run server.js on a Node host and paste its address here, for example:
//   window.GAME_SERVER = "wss://your-server.onrender.com";
// Use wss:// (or https://) when your website uses https. Use ws:// only for plain http.
window.GAME_SERVER = "";
