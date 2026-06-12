import { readFileSync } from "node:fs";
import vm from "node:vm";

try {
  const html = readFileSync("scratch/generated_report.html", "utf8");
  
  // Find all <script> content
  const regex = /<script>([\s\S]*?)<\/script>/g;
  let match;
  let index = 1;
  while ((match = regex.exec(html)) !== null) {
    const js = match[1];
    console.log(`Checking script block #${index}...`);
    try {
      new vm.Script(js);
      console.log(`Script block #${index} parsed successfully.`);
    } catch (e) {
      console.error(`Syntax error in block #${index}:`, e);
      // Print the lines around the error
      if (e.stack) {
        console.error(e.stack);
      }
    }
    index++;
  }
} catch (e) {
  console.error("Error reading or processing file:", e);
}
