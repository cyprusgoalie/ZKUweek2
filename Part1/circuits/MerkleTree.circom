pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux1.circom";


template CheckRoot(n) { // compute the root of a MerkleTree of n Levels 
    signal input leaves[2**n];
    signal output root;

    //[assignment] insert your code here to calculate the Merkle root from 2^n leaves

    // initializing our variable for the number of nodes we will need hashes for
    // since we assume the leaves are already hashed
    var numNodeHashes = 0;

    // initializing a constant that will be used to keep track of Merkle Tree construction
    var c = 0;
    
    // for each level of the MerkleTree, calculating the number of nodes on that level as 2**i,
    // and adding this to our node hash count
    for(var i = 0; i < n; i++)
    {
        numNodeHashes += 2**i;
    }
    // logging for debugging
    log(numNodeHashes);
    
    // creating an array of node hashes whose size we just calculated above
    component nodeHashes[numNodeHashes];

    // initialize all of the hashes as Poseidon hashes with 2 inputs
    // here we are assuming that we are using a binary Merkle tree (since our input is 2**n)
    for(var i = 0; i < n; i++)
    {
        nodeHashes[i] = Poseidon(2);
    }

    // since all of the input leaves are already hashed, we will iterate through the bottom level
    // of our Merkel tree, i.e. node array indecies from 0 to (2**(n-1) - 1)
    for(var i = 0; i < 2**(n-1); i++)
    {
        // each node will have 2 inputs, the two connected leaves. We will apply these input signals
        // by a nested for loop going through the leaves array, adding to the node inputs
        for(var j = 0; j < 2; j++)
        {
            nodeHashes[i].inputs[j] <== leaves[2 * i + j];
        }
    }

    // these next nested for loops construct the rest of the Merkle Tree, using the previous level of nodes
    // as the input for the next level. We use the variable c to keep track of the intermediate levels
    // of the Merkle tree
    for(var i = 2**(n-1); i < numNodeHashes; i++)
    {
        for(var j = 0; j < 2; j++)
        {
            nodeHashes[i].inputs[j] <== nodeHashes[2 * c + j].out;
        }
        c++;
    }

    // the last hased node of the array is our root
    root <== nodeHashes[numNodeHashes - 1].out;
}

template MerkleTreeInclusionProof(n) {
    signal input leaf;
    signal input path_elements[n];
    signal input path_index[n]; // path index are 0's and 1's indicating whether the current element is on the left or right
    signal output root; // note that this is an OUTPUT signal

    //[assignment] insert your code here to compute the root from a leaf and elements along the path

    // defining our list of hashes with length n. We will have n hashed nodes, since we have n path elements we
    // are going through
    component hashes[n];
    component muxes[n];

    //component zero_checks[n];
    //var index = 0;

    // iterating through the number of path elements (which should correspond to the tree depth)
    for (var i = 0; i < n; i++) {
        // initializing our hash function as a binary Poseidon 
        hashes[i] = Poseidon(2);
        muxes[i] = MultiMux1(2);

        muxes[i].c[0][0] <== i == 0? leaf : hashes[i - 1].out;
        muxes[i].c[0][1] <== path_elements[i];

        muxes[i].c[1][0] <== path_elements[i]; 
        muxes[i].c[1][1] <== i == 0? leaf : hashes[i - 1].out;

        muxes[i].s <== path_index[i];

        hashes[i].inputs[0] <== muxes[i].out[0];
        hashes[i].inputs[1] <== muxes[i].out[1];


        // zero_checks[i] = IsZero();
        // zero_checks[i].in <== path_index[i];

        // index = zero_checks[i].out == 1? 0 : 1; 
        
        // log(index);
        // //if the current path index is 0, that means the current element is the left (or first) input to the hash function
        // if(index == 0)
        // {
        //     // setting the first input (i.e. the left input) as the current path element
        //     hashes[i].inputs[0] <== path_elements[i];
        //     // setting the second input (i.e. the right input) as either the leaf (if this is our first time through the loop)
        //     // or the previous hash function (since we're going through a specific path)
        //     hashes[i].inputs[1] <== i == 0? leaf : hashes[i - 1].out;
        // }
        // // otherwise, the current path index should be 1, meaning the current element is the right (or second) input
        // else
        // {
        //     // setting the first input (i.e. the left input) as either the leaf (if this is our first time through the loop)
        //     // or the previous has function 9since we're going through a specific path)
        //     hashes[i].inputs[0] <== i == 0? leaf : hashes[i - 1].out;
        //     // setting the second input (i.e. the right input) as the current path element
        //     hashes[i].inputs[1] <== path_elements[i];
        // }

        // hashes[i].inputs[index] <-- path_elements[i];
        // hashes[i].inputs[1 - index] <-- i == 0? leaf : hashes[i - 1].out;
    }

    // outputing the root as the last hash of our hash list
    root <== hashes[n - 1].out;
}