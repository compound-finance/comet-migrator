#!/bin/bash

set -x

out_file="./abis/CometMigrator.ts"
echo -n "export default " > "$out_file"
cat ./out/CometMigrator.sol/CometMigrator.json | jq -rj '.abi' >> "$out_file"
echo -n " as const;" >> "$out_file"
