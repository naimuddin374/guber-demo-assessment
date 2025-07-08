import { countryCodes } from "../config/enums";
import { sources } from "../sites/sources";
import { assignBrandIfKnown } from "./brands";

async function run() {
    await assignBrandIfKnown(countryCodes.ee, sources.MDE);
}

run().catch((err) => {
    console.error("Error while running assignBrandIfKnown:", err);
});