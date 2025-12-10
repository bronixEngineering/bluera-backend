// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * AuraCardNFTContract (Upgradeable, ERC20-paid)
 * - İlk mint: firstMintUsdCents (varsayılan 0¢)
 * - Sonraki mintler: subsequentMintUsdCents (varsayılan 10¢)
 * - Ödeme: ERC20 (USDC-benzeri 6 dec varsayımıyla cent->tokenUnits: 1 cent = 10_000)
 * - paymentCollector: mint ödemeleri direkt bu adrese gider (owner ayarlanabilir)
 * - paymentToken: owner tarafından değiştirilebilir
 * - hasMinted takibi + mintersPaginated()
 * - TokenData: Network, Holder tag, All-time volume, All-time PnL, Wallet age, Date interval
 * - Pagination örnekleri: tokensOfOwnerPaginated, mintersPaginated, tokenDataBatchPaginated
 * - UUPS upgradeable + Pausable + Ownable + ReentrancyGuard
 */

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/utils/Strings.sol";

contract AuraCardNFTContract is
    Initializable,
    ERC721Upgradeable,
    ERC721EnumerableUpgradeable,
    ERC721URIStorageUpgradeable,
    ERC721PausableUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // ---------- Payment ----------
    IERC20 public paymentToken;               // owner değiştirilebilir
    address public paymentCollector;          // mint gelirleri buraya gider (owner ayarlanabilir)

    // ---------- Pricing (cents) ----------
    uint256 public firstMintUsdCents;         // varsayılan 0
    uint256 public subsequentMintUsdCents;    // varsayılan 10
    uint256 private constant CENT_TO_USDC_UNITS = 10000; // 1 cent = 10_000 (6 dec token varsayımı)

    // ---------- First-time minter tracking ----------
    mapping(address => bool) public hasMinted;
    address[] private _minters;               // yalnızca ilk mint olduğunda eklenir
    mapping(address => bool) private _isListedMinter;

    // ---------- Pagination guard ----------
    uint256 public maxPaginationLimit;

    // ---------- Token IDs ----------
    uint256 public nextId; 

    // ---------- TokenData ----------
    struct TokenData {
        string  holderTag;      // kullanıcı etiketi
        uint256 allTimeVolume;  // toplam volume
        int256 allTimePnl;     // toplam PnL
        uint256 date;   
    }
    mapping(uint256 => TokenData) private _tokenData;

    // ---------- Events ----------
    event Minted(address indexed minter, uint256 indexed tokenId, uint256 amount, bool firstMint, string supabase_uuid);
    event PricesUpdated(uint256 firstMintCents, uint256 subsequentMintCents);
    event PaymentTokenUpdated(address newToken);
    event PaymentCollectorUpdated(address newCollector);
    event PaginationLimitUpdated(uint256 newLimit);
    event TokenDataSet(uint256 indexed tokenId, string holderTag, uint256 allTimeVolume, int256 allTimePnl, uint256 date);
    event URIUpdated(uint256 indexed tokenId, string newuri);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // -------------------- Initialize --------------------
    function initialize(
        address paymentTokenAddress_,
        address paymentCollector_
    ) external initializer {
        require(paymentTokenAddress_ != address(0), "payment token not set");
        require(paymentCollector_ != address(0), "collector not set");

        __ERC721_init("Aura Card", "AC");
        __ERC721Enumerable_init();
        __ERC721URIStorage_init();
        __ERC721Pausable_init();
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        paymentToken     = IERC20(paymentTokenAddress_);
        paymentCollector = paymentCollector_;

        firstMintUsdCents      = 0;
        subsequentMintUsdCents = 10;
        nextId                 = 1;

        maxPaginationLimit = 1000;

        emit PricesUpdated(firstMintUsdCents, subsequentMintUsdCents);
        emit PaymentTokenUpdated(paymentTokenAddress_);
        emit PaymentCollectorUpdated(paymentCollector_);
        emit PaginationLimitUpdated(maxPaginationLimit);
    }

    // -------------------- Mint --------------------
    function mint(string calldata _id) external nonReentrant whenNotPaused {
        uint256 cents  = hasMinted[msg.sender] ? subsequentMintUsdCents : firstMintUsdCents;
        uint256 amount = cents * CENT_TO_USDC_UNITS;

        // Eğer amount > 0 ise transfer yap
        if (amount > 0) {
            paymentToken.safeTransferFrom(msg.sender, paymentCollector, amount);
        }

        uint256 tokenId = nextId++;
        _safeMint(msg.sender, tokenId);

        bool isFirstMint = !hasMinted[msg.sender];
        if (isFirstMint) {
            hasMinted[msg.sender] = true;
        }

        emit Minted(msg.sender, tokenId, amount, isFirstMint, _id);
    }

    // -------------------- Admin --------------------
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setFirstMintUsdCents(uint256 cents) external onlyOwner {
        firstMintUsdCents = cents;
        emit PricesUpdated(firstMintUsdCents, subsequentMintUsdCents);
    }

    function setSubsequentMintUsdCents(uint256 cents) external onlyOwner {
        subsequentMintUsdCents = cents;
        emit PricesUpdated(firstMintUsdCents, subsequentMintUsdCents);
    }

    function setPaymentCollector(address newCollector) external onlyOwner {
        require(newCollector != address(0), "collector=0");
        paymentCollector = newCollector;
        emit PaymentCollectorUpdated(newCollector);
    }

    function setPaymentToken(address newToken) external onlyOwner {
        require(newToken != address(0), "payment token=0");
        paymentToken = IERC20(newToken);
        emit PaymentTokenUpdated(newToken);
    }

    function setTokenURI(uint256 tokenId, string memory uri) public onlyOwner {
        require(_ownerOf(tokenId) != address(0), "URI set for nonexistent token");
        _setTokenURI(tokenId, uri);
        emit URIUpdated(tokenId, uri);
    }

    // -------------------- pagination & batches --------------------

    function setPaginationLimit(uint256 newLimit) external onlyOwner {
        require(newLimit > 0, "limit=0");
        maxPaginationLimit = newLimit;
        emit PaginationLimitUpdated(newLimit);
    }

    function getTokenDataPaginated(uint256 startId, uint256 limit)
        external
        view
        returns (uint256[] memory tokenIds, TokenData[] memory data, uint256 lastId)
    {
        require(limit > 0 && limit <= maxPaginationLimit, "bad limit");

        uint256 supplyLast = (nextId == 0) ? 0 : (nextId - 1);
        lastId = supplyLast; 

        uint256 endId = startId + limit - 1;
        if (endId > supplyLast) endId = supplyLast;

        uint256 outLen = endId - startId + 1;
        tokenIds = new uint256[](outLen);
        data     = new TokenData[](outLen);

        for (uint256 i = 0; i < outLen; ) {
            uint256 tokenId = startId + i;
            // Burn fonksiyonu yok ama yine de güvenlik amaçlı kontrol:
            require(_ownerOf(tokenId) != address(0), "nonexistent tokenId");

            tokenIds[i] = tokenId;

            TokenData storage d = _tokenData[tokenId];
            data[i] = TokenData({
                holderTag:     d.holderTag,
                allTimeVolume: d.allTimeVolume,
                allTimePnl:    d.allTimePnl,
                date:  d.date
            });

            unchecked { ++i; }
        }
    }

    function getTokenDataBatchByIds(uint256[] calldata tokenIds)
        external
        view
        returns (TokenData[] memory data)
    {
        uint256 n = tokenIds.length;
        require(n > 0 && n <= maxPaginationLimit, "bad length");

        data = new TokenData[](n);
        for (uint256 i = 0; i < n; ) {
            uint256 tokenId = tokenIds[i];
            require(_ownerOf(tokenId) != address(0), "nonexistent tokenId");
            TokenData storage d = _tokenData[tokenId];

            // storage -> memory kopya
            data[i] = TokenData({
                holderTag:     d.holderTag,
                allTimeVolume: d.allTimeVolume,
                allTimePnl:    d.allTimePnl,
                date:  d.date
            });

            unchecked { ++i; }
        }
    }

    // -------------------- TokenData (store on-chain) --------------------
    function setTokenData(
        uint256 tokenId,
        string calldata holderTag,
        uint256 allTimeVolume,
        int256 allTimePnl,
        uint256 date
    ) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "data set for nonexistent token");
        _tokenData[tokenId] = TokenData({
            holderTag:     holderTag,
            allTimeVolume: allTimeVolume,
            allTimePnl:    allTimePnl,
            date:  date
        });
        emit TokenDataSet(tokenId, holderTag, allTimeVolume, allTimePnl, date);
    }

    function getTokenData(uint256 tokenId)
        external
        view
        returns (
            string memory holderTag,
            uint256 allTimeVolume,
            int256 allTimePnl,
            uint256 date
        )
    {
        TokenData storage d = _tokenData[tokenId];
        return (d.holderTag, d.allTimeVolume, d.allTimePnl, d.date);
    }

    // -------------------- UUPS --------------------
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function tokenURI(uint256 tokenId) public view override(ERC721Upgradeable, ERC721URIStorageUpgradeable) returns (string memory) {
        require(ownerOf(tokenId) != address(0), "ERC721Metadata: URI query for nonexistent token");
        string memory tokenSpecificURI = super.tokenURI(tokenId);
        if (bytes(tokenSpecificURI).length > 0) {
            return tokenSpecificURI;
        }
        string memory currentBaseURI = _baseURI();
        return bytes(currentBaseURI).length > 0 ? string(abi.encodePacked(currentBaseURI, Strings.toString(tokenId))) : "";
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721Upgradeable, ERC721EnumerableUpgradeable, ERC721URIStorageUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721Upgradeable, ERC721EnumerableUpgradeable, ERC721PausableUpgradeable) returns (address) {
        return super._update(to, tokenId, auth);
    }
    
    function _increaseBalance(address account, uint128 value) internal override(ERC721Upgradeable, ERC721EnumerableUpgradeable) {
        super._increaseBalance(account, value);
    }
}
