# Real tracks go here

Drop an audio file named after the artwork and that record stops using the
built-in synth and plays the real thing. Nothing else to edit — the page probes
for these files on boot.

| Record | File to drop |
| --- | --- |
| FIRST SUMMER | `01-first-summer.mp3` |
| BY THE WATER | `02-by-the-water.mp3` |
| SUNDAY KITCHEN | `03-sunday-kitchen.mp3` |
| THE WAY HOME | `04-the-way-home.mp3` |
| LAST DAY HERE | `05-last-day-here.mp3` |
| GOOD BOY | `06-good-boy.mp3` |
| GRANDMA'S SUMMER | `07-grandmas-summer.mp3` |
| MILES BETWEEN | `08-miles-between.mp3` |

`.m4a`, `.wav` and `.ogg` work too. The panel's running time picks itself up
from the file, so the printed length in `js/store.js` only matters for records
still on the synth.

Keep them small — these load over the wire on click. Trimming to a 60–90s
excerpt at 128–160 kbps is plenty for a landing page.
