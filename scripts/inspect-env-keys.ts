import dotenv from "dotenv";
import fs from "fs";

const content = fs.readFileSync(".env", "utf8");
const parsed = dotenv.parse(content);
console.log("ENV KEYS:", Object.keys(parsed));
