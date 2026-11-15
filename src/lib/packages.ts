/**
 * The package catalogue data, read and validated once per build.
 *
 * Every page that shows packages (the catalogue's cards, its Markdown export) goes through
 * here, so a broken `src/data/packages.json` fails the build with a list of what to fix.
 */
import raw from '../data/packages.json'
import { parsePackagesData, type PackagesData } from '../../scripts/lib/packages-data.ts'

/** The validated catalogue. */
export const packagesData: PackagesData = parsePackagesData(raw, 'src/data/packages.json')
