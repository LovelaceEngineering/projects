#!/bin/bash
# Setup 3-day ILM retention policy for all indices
ES_URL="${ES_URL:-http://localhost:9200}"

echo "Waiting for Elasticsearch..."
until curl -sf "$ES_URL/_cluster/health" > /dev/null 2>&1; do sleep 2; done

echo "Creating 3-day ILM policy..."
curl -sf -X PUT "$ES_URL/_ilm/policy/cleanup-3d" -H 'Content-Type: application/json' -d '{
  "policy": {
    "phases": {
      "hot": { "actions": {} },
      "delete": {
        "min_age": "3d",
        "actions": { "delete": {} }
      }
    }
  }
}'

echo ""
echo "Applying policy to all index templates..."
for pattern in "filebeat-*" "netflow-*" "zeek-*" "proc-*" "openclaw-*"; do
  curl -sf -X PUT "$ES_URL/_index_template/${pattern%%-*}-policy" -H 'Content-Type: application/json' -d "{
    \"index_patterns\": [\"$pattern\"],
    \"template\": {
      \"settings\": {
        \"index.lifecycle.name\": \"cleanup-3d\"
      }
    },
    \"priority\": 100
  }"
  echo ""
done

echo "ILM setup complete - 3 day retention on all indices"
