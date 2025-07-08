import { Job } from "bullmq"
import _ from "lodash"
import { countryCodes } from "../config/enums"
import { ContextType } from "../libs/logger"
import { sources } from "../sites/sources"
import { stringToHash } from "../utils"
import connections from "./../../brandConnections.json"
import items from "./../../pharmacyItems.json"

type BrandsMapping = {
    [key: string]: string[]
}

export async function getBrandsMapping(): Promise<BrandsMapping> {
    const brandConnections = connections

    // Create a map to track brand relationships
    const brandMap = new Map<string, Set<string>>()

    brandConnections.forEach(({ manufacturer_p1, manufacturers_p2 }) => {
        const brand1 = manufacturer_p1.toLowerCase()
        const brands2 = manufacturers_p2.toLowerCase()
        const brand2Array = brands2.split(";").map((b) => b.trim())
        if (!brandMap.has(brand1)) {
            brandMap.set(brand1, new Set())
        }
        brand2Array.forEach((brand2) => {
            if (!brandMap.has(brand2)) {
                brandMap.set(brand2, new Set())
            }
            brandMap.get(brand1)!.add(brand2)
            brandMap.get(brand2)!.add(brand1)
        })
    })

    // Convert the flat map to an object for easier usage
    const flatMapObject: Record<string, string[]> = {}

    brandMap.forEach((relatedBrands, brand) => {
        flatMapObject[brand] = Array.from(relatedBrands)
    })

    return flatMapObject
}

async function getPharmacyItems(countryCode: countryCodes, source: sources, versionKey: string, mustExist = true) {
    const finalProducts = items

    return finalProducts
}

export function checkBrandIsSeparateTerm(input: string, brand: string): boolean {
    // Escape any special characters in the brand name for use in a regular expression
    const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

    // Check if the brand is at the beginning or end of the string
    const atBeginningOrEnd = new RegExp(
        `^(?:${escapedBrand}\\s|.*\\s${escapedBrand}\\s.*|.*\\s${escapedBrand})$`,
        "i"
    ).test(input)

    // Check if the brand is a separate term in the string
    const separateTerm = new RegExp(`\\b${escapedBrand}\\b`, "i").test(input)

    // The brand should be at the beginning, end, or a separate term
    return atBeginningOrEnd || separateTerm
}


// a list of ignoring names
const ignoringNames: string[] = [
    "BIO",
    "NEB",
]

// a list of special front brands
const specialFrontBrands: string[] = ["rich", "rff", "flex", "ultra", "gum", "beauty", "orto", "free", "112", "kin", "happy"]

// a list of front or 2nd word
const specialStartOrSecond: string[] = ["heel", "contour", "nero", "rsv"];

// normalize brand name to remove accents and other special characters
function normalizeBrandName(brandName: string): string {
    return brandName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function isValidBrandMatch(brand: string, productTitle: string): boolean {
    if (brand === "HAPPY" && !productTitle.includes("HAPPY")) return false
    if (ignoringNames.includes(normalizeBrandName(productTitle))) return false
    return true
}


export async function assignBrandIfKnown(countryCode: countryCodes, source: sources, job?: Job) {
    const context = { scope: "assignBrandIfKnown" } as ContextType

    const brandsMapping = await getBrandsMapping()

    const versionKey = "assignBrandIfKnown"
    let products = await getPharmacyItems(countryCode, source, versionKey, false)
    let counter = 0
    for (let product of products) {
        counter++

        if (product.m_id) {
            // Already exists in the mapping table, probably no need to update
            continue
        }

        // if the brand name is in the ignoring names, skip it
        if (ignoringNames.includes(normalizeBrandName(product.title))) {
            continue
        }

        let matchedBrands = []
        for (const brandKey in brandsMapping) {
            const relatedBrands = brandsMapping[brandKey]
            for (const brand of relatedBrands) {

                //  Skip for HAPPY as 
                if (brand === "HAPPY" && !product.title.includes("HAPPY")) continue


                if (product.title.toLowerCase().startsWith(brand.toLowerCase())) {
                    matchedBrands.push(brand)
                    continue
                }

                if (matchedBrands.includes(brand)) {
                    continue
                }

                const normalizedProductTitle = normalizeBrandName(product.title)
                const normalizedBrand = normalizeBrandName(brand)
                if (!isValidBrandMatch(normalizedBrand, normalizedProductTitle)) continue


                // if the brand is a special front brand, check if the product title starts with the brand
                if (specialFrontBrands.includes(normalizedBrand)) {
                    if (!normalizedProductTitle.startsWith(normalizedBrand)) continue
                }

                // if the a list of front or 2nd word
                const words = normalizedProductTitle.split(" ");
                if (specialStartOrSecond.includes(normalizedBrand)) {
                    if (!(words[0] === normalizedBrand || words[1] === normalizedBrand)) {
                        continue;
                    }
                }

                const isBrandMatch = checkBrandIsSeparateTerm(normalizedProductTitle, normalizedBrand)
                if (isBrandMatch) {
                    matchedBrands.push(brand)
                }
            }
        }
        console.log(`${product.title} -> ${_.uniq(matchedBrands)}`)
        const sourceId = product.source_id
        const meta = { matchedBrands }
        const unifiedBrandGroup = _.uniq(matchedBrands).sort()
        const brand = unifiedBrandGroup.length ? unifiedBrandGroup[0] : null

        const key = `${source}_${countryCode}_${sourceId}`
        const uuid = stringToHash(key)

        // Then brand is inserted into product mapping table
    }
}
