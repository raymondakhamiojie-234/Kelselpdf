const fs = require("fs");
let content = fs.readFileSync("server.js", "utf8");
content = content.replace(`    } catch (err) {\r\n        console.error(err);\r\n        res.status(500).send("Server Error");\r\n    }\r\n});\r\n\r\n    } catch (err) {\r\n        console.error(err);\r\n        res.status(500).send("Server Error");\r\n    }\r\n});`, `    } catch (err) {\r\n        console.error(err);\r\n        res.status(500).send("Server Error");\r\n    }\r\n});`);
fs.writeFileSync("server.js", content, "utf8");
console.log("Fixed.");
