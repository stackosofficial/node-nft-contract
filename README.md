## CONFIGURE THE DEPLOYMENT

### Step 1
Clone this repo and install dependencies:
```
git clone https://github.com/grape404/STACKNFT
cd ./STACKNFT
npm install
```

### Step 2
Rename `.env.template` to `.env`, open it and then enter your:
1. Rinkeby node URL (e.g. from [Alchemy](https://dashboard.alchemyapi.io/) or [Infura](https://infura.io/dashboard))
    - If you use non-archival node, remove `blockNumber` from hardhat config. Alchemy should be archival by default.
2. Matic node URL (e.g. from [Alchemy](https://dashboard.alchemyapi.io/) or [Infura](https://infura.io/dashboard))
3. The private key of the account which will send the deployment transaction
4. POLYGONSCAN or ETHERSCAN api key depends where you wish to deploy, matic or rinkeby (get one [here](https://polygonscan.com/myapikey))

### Step 3: Testing locally
1. Run tests `npx hardhat test`

### Step 4
1. Open the file **scripts/deploy.js** and fill settings with your details
2. Adjust chainlink `fee` variable in **contracts/StackOsNFT.sol** (see actual fees [here](https://docs.chain.link/docs/vrf-contracts/))

## DEPLOYMENT AND VERIFICATION
Verification will run automatically after deployment.

Rinkeby testnet:
```shell
npx hardhat run --network rinkeby scripts/deploy.js
```
Matic:
```shell
npx hardhat run --network matic scripts/deploy.js
```
