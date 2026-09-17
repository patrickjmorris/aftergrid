# Notices and data terms

This example reads three public datasets. None of their data is committed to this repository; the build script
fetches it from the publishers' own endpoints. The terms below are the publishers', summarised for orientation —
the linked source governs, not this page.

## NYC Taxi and Limousine Commission trip records

Source: <https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page>
Files: `s3://nyc-tlc/` and the public CDN at `https://d37ci6vzurychx.cloudfront.net/trip-data/`
Terms: NYC Terms of Use, <https://www.nyc.gov/home/terms-of-use.page>

Trip records are collected and provided to the TLC by authorised technology providers. The TLC publishes them
as-is and does not guarantee their accuracy or completeness, and it restates published months. Neither the City
of New York nor the TLC has reviewed, endorsed or approved this example or anything derived from it.

## NOAA GHCN-Daily

Source: <https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily>
Files: `s3://noaa-ghcn-pds/`
Station used: `USW00094728` — New York City, Central Park
Terms: U.S. Government work, in the public domain; the NOAA Open Data Dissemination programme publishes it under
a CC0-equivalent no-rights-reserved dedication.

Cite as: Menne, M.J., I. Durre, B. Gleason, T.G. Houston and R.S. Vose, Global Historical Climatology Network -
Daily (GHCN-Daily), NOAA National Centers for Environmental Information.

NOAA and NCEI do not endorse this example and are not responsible for anything derived from their data.

## Citi Bike system data

Source: <https://citibikenyc.com/system-data>
Terms: Citi Bike Data Sharing Policy, <https://citibikenyc.com/data-sharing-policy>

Citi Bike is operated by NYC Bicycle Share, LLC ("NYCBS"), a Lyft company. The data is made available under the
publisher's data sharing policy, which permits analysis and publication of derived results and prohibits using
the data to identify riders or to imply sponsorship. Neither Lyft, NYCBS, Citigroup nor the New York City
Department of Transportation endorses, sponsors or has approved this example. "Citi Bike" and "Citi" are
trademarks of their owners and are used here only to name the data source.

## Trademarks

Dataset, agency and product names appear here solely to identify the sources. No affiliation with, sponsorship
by or endorsement from the City of New York, the NYC Taxi and Limousine Commission, NOAA, NCEI, Lyft, NYCBS,
Citigroup or the NYC Department of Transportation is claimed or implied.

## Licence of the files in this directory

The files in `examples/nyc-open-data/` — READMEs, scripts, Instance configuration, definitions, golden Questions
and Findings — are part of aftergrid and are licensed under the MIT Licence, the same as the rest of this
repository. See [`LICENSE`](../../LICENSE). That licence covers these files only; it grants no rights in the
third-party data above, which stays under its publisher's terms.
