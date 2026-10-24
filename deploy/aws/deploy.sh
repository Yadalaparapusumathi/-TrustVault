#!/usr/bin/env bash
# Builds the images, pushes them to ECR and applies the Terraform stack in deploy/aws/terraform.
#
#   deploy/aws/deploy.sh                    # full stack (deploy/aws/terraform): Multi-AZ RDS, ECS Fargate, ALB, WAF
#   deploy/aws/deploy.sh --free-tier        # free-tier stack (deploy/aws/free-tier): one EC2 instance + RDS micro
#   add --yes to skip Terraform's confirmation prompts
#
# Needs: aws CLI (credentials configured), terraform >= 1.10, docker with buildx.
# Region: AWS_REGION, else aws_region in the stack's tfvars file, else ap-south-1. AWS_PROFILE is honoured.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
STACK="terraform"
APPROVE=()
for arg in "$@"; do
  case "$arg" in
    --yes) APPROVE=(-auto-approve) ;;
    --free-tier) STACK="free-tier" ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
TF_DIR="$HERE/$STACK"
TFVARS="$HERE/$STACK.tfvars"

for tool in aws terraform docker; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)" \
  || { echo "AWS credentials are not configured (run: aws configure  or  aws configure sso)" >&2; exit 1; }

REGION="${AWS_REGION:-}"
if [[ -z "$REGION" && -f "$TFVARS" ]]; then
  REGION="$(sed -nE 's/^[[:space:]]*aws_region[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$TFVARS" | head -1)"
fi
REGION="${REGION:-ap-south-1}"
export AWS_REGION="$REGION"

ARCH="ARM64"
if [[ "$STACK" == "terraform" && -f "$TFVARS" ]] && grep -qE '^[[:space:]]*cpu_architecture[[:space:]]*=[[:space:]]*"X86_64"' "$TFVARS"; then
  ARCH="X86_64"
fi
PLATFORM=$([[ "$ARCH" == "ARM64" ]] && echo linux/arm64 || echo linux/amd64)

# Immutable tags: the commit, plus a timestamp when the working tree has uncommitted changes.
TAG="$(git -C "$ROOT" rev-parse --short=12 HEAD)"
if [[ -n "$(git -C "$ROOT" status --porcelain -- backend frontend)" ]]; then
  TAG="$TAG-dirty-$(date -u +%Y%m%d%H%M%S)"
fi

echo "==> stack $STACK, account $ACCOUNT, region $REGION, platform $PLATFORM, image tag $TAG"

# ---- Terraform state bucket (created once) ---------------------------------------
STATE_BUCKET="trustvault-tfstate-$ACCOUNT-$REGION"
if ! aws s3api head-bucket --bucket "$STATE_BUCKET" 2>/dev/null; then
  echo "==> creating state bucket $STATE_BUCKET"
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$STATE_BUCKET" >/dev/null
  else
    aws s3api create-bucket --bucket "$STATE_BUCKET" \
      --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  fi
  aws s3api put-bucket-versioning --bucket "$STATE_BUCKET" --versioning-configuration Status=Enabled
  aws s3api put-bucket-encryption --bucket "$STATE_BUCKET" --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]}'
  aws s3api put-public-access-block --bucket "$STATE_BUCKET" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-policy --bucket "$STATE_BUCKET" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{
    \"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",
    \"Resource\":[\"arn:aws:s3:::$STATE_BUCKET\",\"arn:aws:s3:::$STATE_BUCKET/*\"],
    \"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
fi

cd "$TF_DIR"
terraform init -input=false -reconfigure \
  -backend-config="bucket=$STATE_BUCKET" -backend-config="region=$REGION" \
  -backend-config="key=trustvault/$STACK/terraform.tfstate" >/dev/null

TF_VARS=(-var "image_tag=$TAG" -var "aws_region=$REGION")
[[ -f "$TFVARS" ]] && TF_VARS+=(-var-file "$TFVARS")

# ---- 1. Registries first, so there is somewhere to push ------------------------------
echo "==> ensuring ECR repositories"
terraform apply -input=false "${APPROVE[@]}" "${TF_VARS[@]}" \
  -target=aws_ecr_repository.app -target=aws_ecr_lifecycle_policy.app

BACKEND_REPO="$(terraform output -raw ecr_backend)"
FRONTEND_REPO="$(terraform output -raw ecr_frontend)"

# ---- 2. Build and push ------------------------------------------------------------
aws ecr get-login-password | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

push() { # <context dir> <repository url>
  local name="${2##*/}"
  if aws ecr describe-images --repository-name "${2#*/}" --image-ids imageTag="$TAG" >/dev/null 2>&1; then
    echo "==> $name:$TAG already in ECR"
    return
  fi
  echo "==> building and pushing $name:$TAG"
  docker buildx build --platform "$PLATFORM" --provenance=false --push -t "$2:$TAG" "$1"
}
push "$ROOT/backend" "$BACKEND_REPO"
push "$ROOT/frontend" "$FRONTEND_REPO"

# ---- 3. Everything else; waits until the new tasks are healthy ---------------------------
echo "==> applying infrastructure (first run takes 15-25 minutes, mostly RDS and CloudFront)"
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
echo "The stack applied, but $APP_URL is not answering yet (CloudFront can take a few more minutes)." >&2
exit 1
