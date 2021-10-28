# TODO: write about LINK and VRF addresses that should be replaced in random generator contract

## TOKEN DEPLOYED

## CONFIGURE THE DEPLOYMENT

### Step 1
Clone this repo and install dependencies:
```
git clone https://github.com/grape404/STACKNFT
cd ./STACKNFT
npm install
```

### Step 2: Testing locally
1. Run tests `npx hardhat test`

### Step 3
Copy and rename `.env.template` to `.env`, open it and then enter your:
1. Rinkeby node URL (e.g. from [Alchemy](https://dashboard.alchemyapi.io/) or [Infura](https://infura.io/dashboard/ethereum))
2. Mainnet node URL (e.g. from [Alchemy](https://dashboard.alchemyapi.io/) or [Infura](https://infura.io/dashboard/ethereum))
3. The private key of the account which will send the deployment transaction
4. ETHERSCAN API key (get one [here](https://etherscan.io/myapikey))

### Step 4
1. Open the file **scripts/deploy.js** and fill settings with your details
2. Scroll down the file until you see another settings `CONTRACT SETTINGS`, edit it too, as you need
3. Finally you should be able to deploy, please go to deployment section

## DEPLOYMENT AND VERIFICATION
Verification will run automatically after deployment.  
  
Rinkeby testnet:
```shell
npx hardhat run --network rinkeby scripts/deploy.js
```
Mainnet:
```shell
npx hardhat run --network mainnet scripts/deploy.js
```