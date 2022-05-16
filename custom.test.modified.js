// [assignment] please copy the entire modified custom.test.js here

const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
    require('../scripts/compileHasher')
    const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
    const verifier2 = await deploy('Verifier2')
    const verifier16 = await deploy('Verifier16')
    const hasher = await deploy('Hasher')

    const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
    await token.mint(sender.address, utils.parseEther('10000'))

    const amb = await deploy('MockAMB', gov.address, l1ChainId)
    const omniBridge = await deploy('MockOmniBridge', amb.address)

    /** @type {TornadoPool} */
    const tornadoPoolImpl = await deploy(
      'TornadoPool',
      verifier2.address,
      verifier16.address,
      MERKLE_TREE_HEIGHT,
      hasher.address,
      token.address,
      omniBridge.address,
      l1Unwrapper.address,
      gov.address,
      l1ChainId,
      multisig.address,
    )

    const { data } = await tornadoPoolImpl.populateTransaction.initialize(
      MINIMUM_WITHDRAWAL_AMOUNT,
      MAXIMUM_DEPOSIT_AMOUNT,
    )
    const proxy = await deploy(
      'CrossChainUpgradeableProxy',
      tornadoPoolImpl.address,
      gov.address,
      data,
      amb.address,
      l1ChainId,
    )

    const tornadoPool = tornadoPoolImpl.attach(proxy.address)

    await token.approve(tornadoPool.address, utils.parseEther('10000'))

    return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }

  it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
    // [assignment] complete code here
    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
    const aliceKeypair = new Keypair() // contains private and public keys

    // Alice deposits 0.1 ETH into tornado pool
    const aliceDepositAmount = utils.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [aliceDepositUtxo],
    })

    const onTokenBridgedData = encodeDataForBridge({
      proof: args,
      extData,
    })

    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      aliceDepositUtxo.amount,
      onTokenBridgedData,
    )
    // emulating bridge. first it sends tokens to omnibridge mock. Now, the L1 tornado pool should have 0 ETH
    // and the L2 should have all 0.1 ETH
    await token.transfer(omniBridge.address, aliceDepositAmount)

    // this is Alice's L2 address
    const recipient = '0xDeaD00000000000000000000000000000000BEEf'

    // Alice wants to withdraw 0.08 ETH from L2
    const aliceWithdrawAmount = utils.parseEther('0.08')

    // transfer on L2 has not yet happened
    const transferTx = await token.populateTransaction.transfer(recipient, aliceWithdrawAmount)

    // this is the point where the transfer is initiated
    await omniBridge.execute([
      { who: token.address, callData: transferTx.data }, // send tokens to recipient
      { who: recipient, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
    ])

    // the recipient address should have the withdrawn amount (i.e. 0.08 ETH)
    // the L2 should have 0.02 ETH, and the L1 pool should have 0 ETH
    // the pool should have no ETH, because everything has been moved to L2

    // getting token balances
    const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
    const recipientBalance = await token.balanceOf(recipient)
    const omniBridgeBalance = await token.balanceOf(omniBridge.address)

    // logging to console for debugging
    // console.log(tornadoPoolBalance)
    // console.log(recipientBalance)
    // console.log(omniBridgeBalance)

    // asserting the L1 pool to have 0 ETH, the L2 recipient address to have 0.08 ETH
    // and the L2 to have 0.02 ETH
    expect(tornadoPoolBalance).to.be.equal(0)
    expect(recipientBalance).to.be.equal(aliceWithdrawAmount)
    expect(omniBridgeBalance).to.be.equal(aliceDepositAmount.sub(aliceWithdrawAmount))
  })

  it('[assignment] iii. see assignment doc for details', async () => {
    
    // [assignment] complete code here

    const { tornadoPool, token, omniBridge } = await loadFixture(fixture)
    const aliceKeypair = new Keypair() // contains private and public keys
    // generating accounts for Alice and Bob
    const [,,,,,,,aliceL1Account,bobL2Account] = await ethers.getSigners()

    // Alice deposits 0.13 ETH into tornado pool
    const aliceDepositAmount = utils.parseEther('0.13')

    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair: aliceKeypair })
    const { args, extData } = await prepareTransaction({
      tornadoPool,
      outputs: [aliceDepositUtxo],
    })

    await transaction({ tornadoPool, outputs: [aliceDepositUtxo] })

    const onTokenBridgedData = encodeDataForBridge({
      proof: args,
      extData,
    })

    const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
      token.address,
      aliceDepositUtxo.amount,
      onTokenBridgedData,
    )

    // Bob will get 0.06 ETH
    const bobSendAmount = utils.parseEther('0.06')

    // changing Alice's amount based on the amount to send Bob
    const aliceChangeUtxo = new Utxo({
      amount: aliceDepositAmount.sub(bobSendAmount),
      keypair: aliceKeypair,
    })

    // Bob's ETH is sent to the L2 bridge
    await transaction({ tornadoPool, inputs: [aliceDepositUtxo], outputs: [aliceChangeUtxo], recipient: omniBridge.address})

    // Bob's ETH is at the L2 bridge and is sent to his address
    const transferTx = await token.populateTransaction.transfer(bobL2Account.address, bobSendAmount)

    // this is the point where the transfer is initiated
    await omniBridge.execute([
      { who: token.address, callData: transferTx.data }, // send tokens to recipient
      { who: bobL2Account.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
    ])

    // the amount Alice wants to withdraw
    // const aliceWithdrawAmount = utils.parseEther('0.07')

    // full withdraw of Alice's ETH from the tornado pool
    const aliceWithdrawUtxo = new Utxo({
      // amount: aliceDepositAmount.sub(bobSendAmount).sub(aliceWithdrawAmount),
      amount: 0,
      keypair: aliceKeypair,
    })
  
    await transaction({
      tornadoPool,
      inputs: [aliceChangeUtxo],
      outputs: [aliceWithdrawUtxo],
      recipient: aliceL1Account.address,
    })

      // at the end, the Tornado pool and L2 bridge should have 0 ETH,
      // Alice should have 0.07 ETH and Bob should have 0.06 ETH
      const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
      const omniBridgeBalance = await token.balanceOf(omniBridge.address)
      const aliceBalance = await token.balanceOf(aliceL1Account.address)
      const bobBalance = await token.balanceOf(bobL2Account.address)

      // logging to console for debugging
      console.log('Tornado')
      console.log(await token.balanceOf(tornadoPool.address))
      console.log('Bridge')
      console.log(await token.balanceOf(omniBridge.address))
      console.log('Alice Account')
      console.log(await token.balanceOf(aliceL1Account.address))
      console.log('Bob Account')
      console.log(await token.balanceOf(bobL2Account.address))

      // asserting the L1 pool to have 0 ETH, the L2 recipient address to have 0.08 ETH
      // and the L2 to have 0.02 ETH
      expect(tornadoPoolBalance).to.be.equal(0)
      // console.log('Tornado Balance Pass')
      expect(omniBridgeBalance).to.be.equal(0)
      // console.log('Bridge Balance Pass')
      expect(aliceBalance).to.be.equal(aliceDepositAmount.sub(bobSendAmount))
      // console.log('Alice Balance Pass')
      expect(bobBalance).to.be.equal(bobSendAmount)
      // console.log('Bob Balance Pass')
  })
})

