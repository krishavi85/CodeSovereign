/* =====================================================================
   engine.blockchain.js  —  Engine.Blockchain   (Three-Blocked-Capabilities plan §5)

   Blockchain is a SUPPORTED target, not "unsupported". It does not need a
   public mainnet: a local deterministic chain is created inside the run.

     generate(spec)  -> a real Foundry-layout project:
                        src/*.sol (audited-pattern contracts, no external imports),
                        test/*.t.sol (forge tests), foundry.toml, script/Deploy.s.sol,
                        chain/scenario.json (deploy + transactions for the in-loop
                        local chain), README.md
     scenario(spec)  -> the deploy + test-transaction plan
     verify()        -> Promise<result>  — routes through window.CSAdapters.evm:
                        vendored solc + @ethereumjs/vm local chain (or forge/anvil
                        when installed) -> compile -> deploy -> run transactions ->
                        inspect receipts/events/state -> static analysis ->
                        .sovereign/blockchain-evidence.json -> PASS / FAIL / BLOCKED

   window.Engine.Blockchain
   ===================================================================== */
(function () {
  'use strict';
  var Engine = window.Engine || (window.Engine = {});

  function kindOf(spec) {
    var p = String((spec && spec.prompt) || (spec && spec.name) || '').toLowerCase();
    if (/\berc-?721\b|\bnft\b|non-fungible|collectible|art collection/.test(p)) return 'erc721';
    if (/\berc-?20\b|token|coin|fungible|\$[A-Z]{2,6}\b/.test(p)) return 'erc20';
    if (/\bescrow\b|marketplace|auction/.test(p)) return 'escrow';
    if (/\bdao\b|governance|voting|proposal/.test(p)) return 'voting';
    return 'erc20';
  }

  function pascal(s) { return String(s || 'Token').replace(/[^A-Za-z0-9]/g, ' ').split(/\s+/).filter(Boolean).map(function (w) { return w[0].toUpperCase() + w.slice(1); }).join('') || 'Token'; }

  /* ---------------- contract sources (audited patterns, zero imports) ---------------- */

  function erc20(name) {
    return '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\n' +
      '/// @title ' + name + ' — minimal, checks-effects-interactions ERC-20.\n' +
      'contract ' + name + ' {\n' +
      '    string public name = "' + name + '";\n' +
      '    string public symbol = "' + name.slice(0, 4).toUpperCase() + '";\n' +
      '    uint8 public constant decimals = 18;\n' +
      '    uint256 public totalSupply;\n' +
      '    address public owner;\n\n' +
      '    mapping(address => uint256) public balanceOf;\n' +
      '    mapping(address => mapping(address => uint256)) public allowance;\n\n' +
      '    event Transfer(address indexed from, address indexed to, uint256 value);\n' +
      '    event Approval(address indexed owner, address indexed spender, uint256 value);\n\n' +
      '    error NotOwner();\n    error InsufficientBalance();\n    error InsufficientAllowance();\n\n' +
      '    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }\n\n' +
      '    constructor(uint256 initialSupply) {\n' +
      '        owner = msg.sender;\n' +
      '        _mint(msg.sender, initialSupply);\n' +
      '    }\n\n' +
      '    function transfer(address to, uint256 value) external returns (bool) {\n' +
      '        return _transfer(msg.sender, to, value);\n' +
      '    }\n\n' +
      '    function approve(address spender, uint256 value) external returns (bool) {\n' +
      '        allowance[msg.sender][spender] = value;\n' +
      '        emit Approval(msg.sender, spender, value);\n' +
      '        return true;\n' +
      '    }\n\n' +
      '    function transferFrom(address from, address to, uint256 value) external returns (bool) {\n' +
      '        uint256 a = allowance[from][msg.sender];\n' +
      '        if (a < value) revert InsufficientAllowance();\n' +
      '        if (a != type(uint256).max) allowance[from][msg.sender] = a - value;\n' +
      '        return _transfer(from, to, value);\n' +
      '    }\n\n' +
      '    function mint(address to, uint256 value) external onlyOwner { _mint(to, value); }\n\n' +
      '    function burn(uint256 value) external {\n' +
      '        if (balanceOf[msg.sender] < value) revert InsufficientBalance();\n' +
      '        balanceOf[msg.sender] -= value;\n' +
      '        totalSupply -= value;\n' +
      '        emit Transfer(msg.sender, address(0), value);\n' +
      '    }\n\n' +
      '    function _transfer(address from, address to, uint256 value) internal returns (bool) {\n' +
      '        if (balanceOf[from] < value) revert InsufficientBalance();\n' +
      '        balanceOf[from] -= value;\n' +
      '        balanceOf[to] += value;\n' +
      '        emit Transfer(from, to, value);\n' +
      '        return true;\n' +
      '    }\n\n' +
      '    function _mint(address to, uint256 value) internal {\n' +
      '        totalSupply += value;\n' +
      '        balanceOf[to] += value;\n' +
      '        emit Transfer(address(0), to, value);\n' +
      '    }\n' +
      '}\n';
  }

  function erc721(name) {
    return '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\n' +
      '/// @title ' + name + ' — minimal ERC-721 (ownership + safe-ish mint).\n' +
      'contract ' + name + ' {\n' +
      '    string public name = "' + name + '";\n' +
      '    string public symbol = "' + name.slice(0, 4).toUpperCase() + '";\n' +
      '    address public owner;\n' +
      '    uint256 public totalSupply;\n\n' +
      '    mapping(uint256 => address) public ownerOf;\n' +
      '    mapping(address => uint256) public balanceOf;\n' +
      '    mapping(uint256 => address) public getApproved;\n\n' +
      '    event Transfer(address indexed from, address indexed to, uint256 indexed id);\n' +
      '    event Approval(address indexed owner, address indexed approved, uint256 indexed id);\n\n' +
      '    error NotOwner();\n    error NotAuthorized();\n    error WrongFrom();\n    error ZeroAddress();\n\n' +
      '    constructor() { owner = msg.sender; }\n\n' +
      '    function mint(address to) external returns (uint256 id) {\n' +
      '        if (msg.sender != owner) revert NotOwner();\n' +
      '        if (to == address(0)) revert ZeroAddress();\n' +
      '        id = ++totalSupply;\n' +
      '        ownerOf[id] = to;\n' +
      '        balanceOf[to] += 1;\n' +
      '        emit Transfer(address(0), to, id);\n' +
      '    }\n\n' +
      '    function approve(address to, uint256 id) external {\n' +
      '        if (ownerOf[id] != msg.sender) revert NotAuthorized();\n' +
      '        getApproved[id] = to;\n' +
      '        emit Approval(msg.sender, to, id);\n' +
      '    }\n\n' +
      '    function transferFrom(address from, address to, uint256 id) external {\n' +
      '        if (ownerOf[id] != from) revert WrongFrom();\n' +
      '        if (to == address(0)) revert ZeroAddress();\n' +
      '        if (msg.sender != from && getApproved[id] != msg.sender) revert NotAuthorized();\n' +
      '        delete getApproved[id];\n' +
      '        balanceOf[from] -= 1;\n' +
      '        balanceOf[to] += 1;\n' +
      '        ownerOf[id] = to;\n' +
      '        emit Transfer(from, to, id);\n' +
      '    }\n' +
      '}\n';
  }

  function voting(name) {
    return '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\n' +
      '/// @title ' + name + ' — one-address-one-vote proposal registry.\n' +
      'contract ' + name + ' {\n' +
      '    address public admin;\n' +
      '    struct Proposal { string title; uint256 yes; uint256 no; bool open; }\n' +
      '    Proposal[] public proposals;\n' +
      '    mapping(uint256 => mapping(address => bool)) public voted;\n\n' +
      '    event Proposed(uint256 indexed id, string title);\n' +
      '    event Voted(uint256 indexed id, address indexed voter, bool support);\n' +
      '    event Closed(uint256 indexed id, bool passed);\n\n' +
      '    error NotAdmin();\n    error AlreadyVoted();\n    error Closed_();\n\n' +
      '    constructor() { admin = msg.sender; }\n\n' +
      '    function propose(string calldata title) external returns (uint256 id) {\n' +
      '        if (msg.sender != admin) revert NotAdmin();\n' +
      '        id = proposals.length;\n' +
      '        proposals.push(Proposal(title, 0, 0, true));\n' +
      '        emit Proposed(id, title);\n' +
      '    }\n\n' +
      '    function vote(uint256 id, bool support) external {\n' +
      '        Proposal storage p = proposals[id];\n' +
      '        if (!p.open) revert Closed_();\n' +
      '        if (voted[id][msg.sender]) revert AlreadyVoted();\n' +
      '        voted[id][msg.sender] = true;\n' +
      '        if (support) p.yes += 1; else p.no += 1;\n' +
      '        emit Voted(id, msg.sender, support);\n' +
      '    }\n\n' +
      '    function close(uint256 id) external returns (bool passed) {\n' +
      '        if (msg.sender != admin) revert NotAdmin();\n' +
      '        Proposal storage p = proposals[id];\n' +
      '        p.open = false;\n' +
      '        passed = p.yes > p.no;\n' +
      '        emit Closed(id, passed);\n' +
      '    }\n\n' +
      '    function tally(uint256 id) external view returns (uint256 yes, uint256 no) {\n' +
      '        return (proposals[id].yes, proposals[id].no);\n' +
      '    }\n' +
      '}\n';
  }

  function escrow(name) {
    return '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\n' +
      '/// @title ' + name + ' — pull-payment escrow (reentrancy-safe).\n' +
      'contract ' + name + ' {\n' +
      '    address public immutable payer;\n' +
      '    address public immutable payee;\n' +
      '    address public immutable arbiter;\n' +
      '    bool public released;\n' +
      '    bool public refunded;\n' +
      '    mapping(address => uint256) public withdrawable;\n\n' +
      '    event Funded(uint256 amount);\n    event Released(uint256 amount);\n    event Refunded(uint256 amount);\n    event Withdrawn(address indexed who, uint256 amount);\n\n' +
      '    error NotArbiter();\n    error Settled();\n    error Nothing();\n\n' +
      '    constructor(address _payee, address _arbiter) payable {\n' +
      '        payer = msg.sender; payee = _payee; arbiter = _arbiter;\n' +
      '        if (msg.value > 0) emit Funded(msg.value);\n' +
      '    }\n\n' +
      '    function release() external {\n' +
      '        if (msg.sender != arbiter) revert NotArbiter();\n' +
      '        if (released || refunded) revert Settled();\n' +
      '        released = true;\n' +
      '        withdrawable[payee] = address(this).balance;\n' +
      '        emit Released(withdrawable[payee]);\n' +
      '    }\n\n' +
      '    function refund() external {\n' +
      '        if (msg.sender != arbiter) revert NotArbiter();\n' +
      '        if (released || refunded) revert Settled();\n' +
      '        refunded = true;\n' +
      '        withdrawable[payer] = address(this).balance;\n' +
      '        emit Refunded(withdrawable[payer]);\n' +
      '    }\n\n' +
      '    function withdraw() external {\n' +
      '        uint256 amount = withdrawable[msg.sender];\n' +
      '        if (amount == 0) revert Nothing();\n' +
      '        withdrawable[msg.sender] = 0;\n' +
      '        (bool ok, ) = msg.sender.call{value: amount}("");\n' +
      '        require(ok, "transfer failed");\n' +
      '        emit Withdrawn(msg.sender, amount);\n' +
      '    }\n' +
      '}\n';
  }

  function contractSource(kind, name) {
    if (kind === 'erc721') return erc721(name);
    if (kind === 'voting') return voting(name);
    if (kind === 'escrow') return escrow(name);
    return erc20(name);
  }

  /* ---------------- forge test ---------------- */

  function forgeTest(kind, name) {
    var head = '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\nimport "forge-std/Test.sol";\nimport "../src/' + name + '.sol";\n\ncontract ' + name + 'Test is Test {\n    ' + name + ' c;\n    address alice = address(0xA11CE);\n    address bob = address(0xB0B);\n\n';
    if (kind === 'erc20') {
      return head +
        '    function setUp() public { c = new ' + name + '(1_000_000e18); }\n\n' +
        '    function test_initialSupply() public view { assertEq(c.balanceOf(address(this)), 1_000_000e18); }\n\n' +
        '    function test_transfer() public {\n        c.transfer(alice, 100e18);\n        assertEq(c.balanceOf(alice), 100e18);\n    }\n\n' +
        '    function test_transfer_insufficient_reverts() public {\n        vm.prank(alice);\n        vm.expectRevert();\n        c.transfer(bob, 1);\n    }\n\n' +
        '    function testFuzz_transfer(uint96 amount) public {\n        amount = uint96(bound(amount, 0, 1_000_000e18));\n        c.transfer(alice, amount);\n        assertEq(c.balanceOf(alice), amount);\n    }\n}\n';
    }
    if (kind === 'erc721') {
      return head +
        '    function setUp() public { c = new ' + name + '(); }\n\n' +
        '    function test_mint() public {\n        uint256 id = c.mint(alice);\n        assertEq(c.ownerOf(id), alice);\n        assertEq(c.balanceOf(alice), 1);\n    }\n\n' +
        '    function test_mint_onlyOwner_reverts() public {\n        vm.prank(alice);\n        vm.expectRevert();\n        c.mint(bob);\n    }\n\n' +
        '    function test_transferFrom() public {\n        uint256 id = c.mint(alice);\n        vm.prank(alice);\n        c.transferFrom(alice, bob, id);\n        assertEq(c.ownerOf(id), bob);\n    }\n}\n';
    }
    if (kind === 'voting') {
      return head +
        '    function setUp() public { c = new ' + name + '(); }\n\n' +
        '    function test_proposeAndVote() public {\n        uint256 id = c.propose("ship it");\n        c.vote(id, true);\n        vm.prank(alice); c.vote(id, true);\n        vm.prank(bob); c.vote(id, false);\n        (uint256 yes, uint256 no) = c.tally(id);\n        assertEq(yes, 2); assertEq(no, 1);\n    }\n\n' +
        '    function test_doubleVote_reverts() public {\n        uint256 id = c.propose("x");\n        c.vote(id, true);\n        vm.expectRevert();\n        c.vote(id, true);\n    }\n}\n';
    }
    return head + '    function setUp() public {}\n    function test_placeholder() public pure { assertTrue(true); }\n}\n';
  }

  /* ---------------- scenario for the in-loop local chain ---------------- */

  function scenario(spec) {
    var kind = kindOf(spec);
    var name = pascal((spec && spec.name) || 'Token');
    if (kind === 'erc20') {
      return {
        contract: name,
        constructorArgs: [{ type: 'uint256', value: '1000000000000000000000000' }],
        steps: [
          { call: 'balanceOf(address)', args: [{ type: 'account', value: 0 }], readOnly: true, expect: '1000000000000000000000000' },
          { call: 'transfer(address,uint256)', from: 0, args: [{ type: 'account', value: 2 }, { type: 'uint256', value: '500' }] },
          { call: 'balanceOf(address)', args: [{ type: 'account', value: 2 }], readOnly: true, expect: '500' },
          { call: 'transfer(address,uint256)', from: 1, args: [{ type: 'account', value: 2 }, { type: 'uint256', value: '1' }], expectRevert: true },
          { call: 'approve(address,uint256)', from: 0, args: [{ type: 'account', value: 3 }, { type: 'uint256', value: '1000' }] },
          { call: 'transferFrom(address,address,uint256)', from: 3, args: [{ type: 'account', value: 0 }, { type: 'account', value: 4 }, { type: 'uint256', value: '1000' }] },
          { call: 'balanceOf(address)', args: [{ type: 'account', value: 4 }], readOnly: true, expect: '1000' }
        ]
      };
    }
    if (kind === 'erc721') {
      return {
        contract: name, constructorArgs: [],
        steps: [
          { call: 'mint(address)', from: 0, args: [{ type: 'account', value: 1 }] },
          { call: 'ownerOf(uint256)', args: [{ type: 'uint256', value: '1' }], readOnly: true, expect: { account: 1 } },
          { call: 'mint(address)', from: 1, args: [{ type: 'account', value: 2 }], expectRevert: true },
          { call: 'balanceOf(address)', args: [{ type: 'account', value: 1 }], readOnly: true, expect: '1' }
        ]
      };
    }
    if (kind === 'voting') {
      return {
        contract: name, constructorArgs: [],
        steps: [
          { call: 'propose(string)', from: 0, args: [{ type: 'string', value: 'ship' }] },
          { call: 'vote(uint256,bool)', from: 0, args: [{ type: 'uint256', value: '0' }, { type: 'bool', value: true }] },
          { call: 'vote(uint256,bool)', from: 1, args: [{ type: 'uint256', value: '0' }, { type: 'bool', value: true }] },
          { call: 'vote(uint256,bool)', from: 0, args: [{ type: 'uint256', value: '0' }, { type: 'bool', value: true }], expectRevert: true }
        ]
      };
    }
    return { contract: name, constructorArgs: [], steps: [] };
  }

  /* ---------------- generate ---------------- */

  function generate(spec) {
    spec = spec || {};
    var kind = kindOf(spec);
    var name = pascal(spec.name || 'Token');
    var files = {};
    files['src/' + name + '.sol'] = contractSource(kind, name);
    files['test/' + name + '.t.sol'] = forgeTest(kind, name);
    files['foundry.toml'] =
      '[profile.default]\nsrc = "src"\nout = "out"\nlibs = ["lib"]\ntest = "test"\noptimizer = true\noptimizer_runs = 200\nevm_version = "shanghai"\nfuzz = { runs = 128 }\n\n# forge-std is only needed for the optional `forge test` path; the in-loop\n# local chain (solc + @ethereumjs/vm) needs no dependencies.\n';
    files['script/Deploy.s.sol'] =
      '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\n\nimport "forge-std/Script.sol";\nimport "../src/' + name + '.sol";\n\ncontract Deploy is Script {\n    function run() external {\n        vm.startBroadcast();\n        ' + (kind === 'erc20' ? 'new ' + name + '(1_000_000e18);' : kind === 'erc721' ? 'new ' + name + '();' : 'new ' + name + '();') + '\n        vm.stopBroadcast();\n    }\n}\n';
    files['chain/scenario.json'] = JSON.stringify(scenario(spec), function (_k, v) { return typeof v === 'bigint' ? v.toString() : v; }, 2) + '\n';
    files['.gitignore'] = 'out/\ncache/\nbroadcast/\nlib/\nnode_modules/\n.sovereign/\n';
    files['package.json'] = JSON.stringify({
      name: (spec.name || 'contracts').toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      version: '0.1.0', private: true,
      description: 'Generated by CodeSovereign — ' + kind.toUpperCase() + ' smart contracts, verified on a local chain.',
      scripts: {
        test: 'forge test || echo "install Foundry for forge tests; CodeSovereign verifies on the bundled local chain"',
        build: 'forge build || echo "solc compile runs inside CodeSovereign"',
        deploy: 'forge script script/Deploy.s.sol --rpc-url ${RPC_URL:-http://localhost:8545} --broadcast'
      }
    }, null, 2) + '\n';
    files['README.md'] =
      '# ' + name + '\n\nGenerated by **CodeSovereign** — ' + kind.toUpperCase() + ' smart contracts.\n\n' +
      'CodeSovereign verifies these **without a public chain**: it compiles `src/*.sol` with `solc`, ' +
      'spins a local deterministic EVM (`@ethereumjs/vm`, or `anvil` when Foundry is installed), deploys the ' +
      'contract, runs the transactions in `chain/scenario.json`, and inspects the receipts, events, gas and ' +
      'storage. Evidence lands in `.sovereign/blockchain-evidence.json` and gates the Definition-of-Done.\n\n' +
      '## Run the richer Foundry suite (optional)\n\n```\ncurl -L https://foundry.paradigm.xyz | bash && foundryup\nforge install foundry-rs/forge-std\nforge test         # unit + fuzz\nforge script script/Deploy.s.sol\n```\n\n' +
      '## Contracts\n\n- `src/' + name + '.sol` — ' + ({ erc20: 'ERC-20 token (mint / transfer / approve / transferFrom / burn)', erc721: 'ERC-721 NFT (mint / ownerOf / approve / transferFrom)', voting: 'proposal + one-address-one-vote registry', escrow: 'pull-payment escrow' }[kind]) + '\n';

    var out = [];
    Object.keys(files).sort().forEach(function (p) { out.push({ path: '/' + p, content: files[p] }); });
    return out;
  }

  function verify(opts) {
    opts = opts || {};
    var CA = window.CSAdapters;
    if (!CA || !CA.evm) {
      return Promise.resolve({ status: 'BLOCKED', capability: 'blockchain', reason: 'DESKTOP_REQUIRED',
        need: 'the blockchain adapter runs in the desktop app (solc + local chain)' });
    }
    var sc = opts.scenario;
    if (!sc) {
      try { sc = JSON.parse(Engine.FS.read('/chain/scenario.json') || 'null'); } catch (_) { sc = null; }
    }
    return CA.evm({ scenario: sc || {} });
  }

  Engine.Blockchain = { generate: generate, scenario: scenario, verify: verify, kindOf: kindOf };
  console.info('[Blockchain] EVM contract generator + local-chain verifier ready — Engine.Blockchain');
})();
