//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { PoseidonT3 } from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract

contract MerkleTree is Verifier {

    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves
        hashes = new uint256[](15);
        uint256 c = 0;

        for(uint256 i = 0; i < 8; i++)
        {
            hashes[i] = 0;
        }

        for(uint256 i = 8; i < 15; i++)
        {
            uint256[2] memory tempInputs;
            for(uint256 j = 0; j < 2; j++)
            {
                tempInputs[j] = hashes[2 * c + j];
            }
            hashes[i] = PoseidonT3.poseidon(tempInputs);
            c++;
        }

        root = hashes[15 - 1];
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree
        require(index <= 8,"Index over 8, no more blank leaves");
        hashes[index] = hashedLeaf;
        index++;

        uint256 c = 0;
        for(uint256 i = 8; i < 15; i++)
        {
            uint256[2] memory tempInputs;
            for(uint256 j = 0; j < 2; j++)
            {
                tempInputs[j] = hashes[2 * c + j];
            }
            hashes[i] = PoseidonT3.poseidon(tempInputs);
            c++;
        }

        root = hashes[15 - 1];
        return root;
    }

    function verify(
            uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c,
            uint[1] memory input
        ) public view returns (bool r) {

        // [assignment] verify an inclusion proof and check that the proof root matches current root

        return verifyProof(a,b,c,input) && input[0] == root;
    }
}
