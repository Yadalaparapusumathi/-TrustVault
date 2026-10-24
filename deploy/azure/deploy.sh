#!/usr/bin/env bash
# Builds the images, pushes them to Azure Container Registry and applies deploy/azure/terraform.
#
#   az login                         # once
#   deploy/azure/deploy.sh           # interactive: Terraform shows the plan and asks first
#   deploy/azure/deploy.sh --yes     # non-interactive
#
# Needs: az CLI (logged in), terraform >= 1.10, docker with buildx.
# Region: AZURE_LOCATION, else location in deploy/azure/terraform.tfvars, else centralindia.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TF_DIR="$HERE/terraform"
TFVARS="$HERE/terraform.tfvars"

APPROVE=()
[[ "${1:-}" == "--yes" ]] && APPROVE=(-auto-approve)

for tool in az terraform docker; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

SUBSCRIPTION="$(az account show --query id -o tsv)" || { echo "run: az login" >&2; exit 1; }
export ARM_SUBSCRIPTION_ID="$SUBSCRIPTION"

LOCATION="${AZURE_LOCATION:-}"
if [[ -z "$LOCATION" && -f "$TFVARS" ]]; then
  LOCATION="$(sed -nE 's/^[[:space:]]*location[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$TFVARS" | head -1)"
fi
LOCATION="${LOCATION:-centralindia}"

TAG="$(git -C "$ROOT" rev-parse --short=12 HEAD)"
if [[ -n "$(git -C "$ROOT" status --porcelain -- backend frontend)" ]]; then
  TAG="$TAG-dirty-$(date -u +%Y%m%d%H%M%S)"
fi

echo "==> subscription $SUBSCRIPTION, location $LOCATION, image tag $TAG"

echo "==> registering resource providers"
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.DBforPostgreSQL Microsoft.ContainerRegistry \
          Microsoft.KeyVault Microsoft.Network Microsoft.Storage Microsoft.ManagedIdentity Microsoft.Insights; do
  az provider register --namespace "$ns" --wait >/dev/null
done

# ---- Terraform state (created once): versioned, TLS-only, no public blob access -------------
STATE_RG="trustvault-tfstate"
STATE_ACCOUNT="tvtfstate$(echo -n "$SUBSCRIPTION" | shasum | cut -c1-12)"
if ! az storage account show -n "$STATE_ACCOUNT" -g "$STATE_RG" >/dev/null 2>&1; then
  echo "==> creating state storage $STATE_ACCOUNT"
  az group create -n "$STATE_RG" -l "$LOCATION" -o none
  az storage account create -n "$STATE_ACCOUNT" -g "$STATE_RG" -l "$LOCATION" --sku Standard_LRS \
    --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access false --https-only true -o none
  az storage account blob-service-properties update -n "$STATE_ACCOUNT" -g "$STATE_RG" \
    --enable-versioning true --enable-delete-retention true --delete-retention-days 30 -o none
  az storage container create -n tfstate --account-name "$STATE_ACCOUNT" --auth-mode key -o none
fi

cd "$TF_DIR"
terraform init -input=false -reconfigure \
  -backend-config="resource_group_name=$STATE_RG" -backend-config="storage_account_name=$STATE_ACCOUNT" \
  -backend-config="container_name=tfstate" >/dev/null

TF_VARS=(-var "image_tag=$TAG" -var "location=$LOCATION")
[[ -f "$TFVARS" ]] && TF_VARS+=(-var-file "$TFVARS")

# ---- 1. Registry first, so there is somewhere to push ------------------------------
echo "==> ensuring container registry"
terraform apply -input=false "${APPROVE[@]}" "${TF_VARS[@]}" -target=azurerm_container_registry.main
ACR_NAME="$(terraform output -raw acr_name)"
ACR="$(terraform output -raw acr_login_server)"

# ---- 2. Build (Container Apps run linux/amd64) and push -------------------------------
az acr login -n "$ACR_NAME"
push() { # <context dir> <repository>
  if az acr repository show -n "$ACR_NAME" --image "$2:$TAG" >/dev/null 2>&1; then
    echo "==> $2:$TAG already in ACR"
    return
  fi
  echo "==> building and pushing $2:$TAG"
  docker buildx build --platform linux/amd64 --provenance=false --push -t "$ACR/$2:$TAG" "$1"
}
push "$ROOT/backend" trustvault-backend
push "$ROOT/frontend" trustvault-frontend

# ---- 3. Everything else -----------------------------------------------------------
echo "==> applying infrastructure (first run takes 10-20 minutes, mostly PostgreSQL)"
terraform apply -input=false "${APPROVE[@]}" "${TF_VARS[@]}"

APP_URL="$(terraform output -raw app_url)"
echo "==> waiting for $APP_URL"
for _ in $(seq 1 60); do
  if curl -fsS "$APP_URL/actuator/health" 2>/dev/null | grep -q '"UP"'; then
    echo
    echo "TrustVault is up: $APP_URL"
    echo "Admin bootstrap password: $(terraform output -raw admin_password_command)"
    exit 0
  fi
  printf '.'
  sleep 10
done
echo
echo "The stack applied, but $APP_URL is not healthy yet. Logs:" >&2
echo "  az containerapp logs show -g $(terraform output -raw resource_group) -n $(terraform output -raw container_app) --container backend" >&2
exit 1
