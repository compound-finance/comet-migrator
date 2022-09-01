#!/bin/bash

set -x

out_file="./abis/Comet_V2_Migrator.ts"
echo -n "export default " > "$out_file"
cat ./out/Comet_V2_Migrator.sol/Comet_V2_Migrator.json | jq -rj '.abi' >> "$out_file"
echo -n " as const;" >> "$out_file"
