// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title ERC20‐Based Claim Contract (Upgradeable)
/// @notice Tracks "claimable" balances per user and lets them withdraw a specific ERC20 token
contract BlueraClaimContract is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice The ERC20 token that will be distributed when users claim
    IERC20 public rewardToken;

    /// @notice Maps each user address to the amount of `rewardToken` they can claim (in token's smallest unit)
    mapping(address => uint256) public claimable;

    /// @notice Emitted when a user's claimable balance is updated
    /// @param user The address whose balance changed
    /// @param newTotal The new claimable balance
    /// @param timestamp The block.timestamp at which the update occurred
    event ClaimableUpdated(address indexed user, uint256 newTotal, uint256 timestamp);

    /// @notice Emitted when a user successfully claims their `rewardToken`
    /// @param user The address that claimed
    /// @param amount The amount of tokens claimed
    /// @param timestamp The block.timestamp at which the claim occurred
    event Claimed(address indexed user, uint256 amount, uint256 timestamp);

    /// @notice Emitted when the `rewardToken` address is changed
    /// @param oldToken The previous token address
    /// @param newToken The new token address
    /// @param timestamp The block.timestamp at which the change occurred
    event RewardTokenChanged(address indexed oldToken, address indexed newToken, uint256 timestamp);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract (replaces constructor for upgradeable contracts)
    /// @param _rewardToken The address of the ERC20 token to be distributed on claim
    /// @param _owner The address that will own the contract
    function initialize(address _rewardToken, address _owner) public initializer {
        require(_rewardToken != address(0), "Zero token address");
        require(_owner != address(0), "Zero owner address");
        
        __Ownable_init(_owner);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        rewardToken = IERC20(_rewardToken);
    }

    /// @notice Authorizes upgrade (only owner can upgrade)
    /// @dev Required by UUPSUpgradeable
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice Allows the contract to receive native ETH (unused here, but kept for completeness)
    receive() external payable {}

    /// @notice Get the claimable amount for a specific wallet address
    /// @param user The wallet address to check
    /// @return The amount of tokens the user can claim (in token's smallest unit)
    function getClaimableAmount(address user) external view returns (uint256) {
        return claimable[user];
    }

    /// @notice Owner can set or top up a user's "claimable" balance (in token units)
    /// @dev Only callable by the contract owner
    /// @param user The address to credit
    /// @param amount The amount of `rewardToken` (in its smallest unit) to add
    function setClaimable(address user, uint256 amount) external onlyOwner {
        require(user != address(0), "Zero address");
        require(amount > 0, "Amount must be > 0");

        claimable[user] += amount;
        emit ClaimableUpdated(user, claimable[user], block.timestamp);
    }

    function setClaimableBatch(address[] calldata users, uint256[] calldata amounts) external onlyOwner {
        require(users.length == amounts.length, "Length mismatch");
        for (uint256 i = 0; i < users.length; i++) {
            require(users[i] != address(0), "Zero address");
            require(amounts[i] > 0, "Amount must be > 0");
            claimable[users[i]] += amounts[i];
            emit ClaimableUpdated(users[i], claimable[users[i]], block.timestamp);
        }
    }

    /// @notice Owner can overwrite a user's "claimable" balance directly
    /// @dev Only callable by the contract owner
    /// @param user The address whose balance will be set
    /// @param newAmount The exact new amount (in `rewardToken` smallest unit) to assign
    function updateClaimable(address user, uint256 newAmount) external onlyOwner {
        require(user != address(0), "Zero address");
        claimable[user] = newAmount;
        emit ClaimableUpdated(user, newAmount, block.timestamp);
    }

    function claim() external nonReentrant {
        address user = msg.sender;
        uint256 amount = claimable[user];
        require(amount > 0, "Nothing to claim");

        // Kontratta yeterli token var mi? (gas tahmininde revert'i erken yakalar)
        require(rewardToken.balanceOf(address(this)) >= amount, "Insufficient contract balance");

        // Effects -> Interactions (reentrancy güvenli)
        claimable[user] = 0;

        // Token transfer (SafeERC20 revert ederse tüm state geri döner)
        rewardToken.safeTransfer(user, amount);

        emit Claimed(user, amount, block.timestamp);
    }

    /// @notice Owner can update the ERC20 token address used for claims
    /// @dev Only callable by the contract owner
    /// @param newToken The new ERC20 token contract address
    function setRewardToken(address newToken) external onlyOwner {
        require(newToken != address(0), "Zero token address");
        address old = address(rewardToken);
        require(old != newToken, "Same token address");

        rewardToken = IERC20(newToken);
        emit RewardTokenChanged(old, newToken, block.timestamp);
    }

    /// @notice Owner can withdraw any ERC20 tokens accidentally sent to this contract
    /// @dev Only callable by the contract owner
    /// @param token The address of the ERC20 token to withdraw
    /// @param to The destination address to receive the tokens
    /// @param amount The amount of tokens to withdraw
    function withdrawTokens(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "Zero recipient");
        require(token != address(0), "Zero token address");
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Owner can withdraw any native ETH accidentally sent to this contract
    /// @dev Only callable by the contract owner
    /// @param to The destination address to receive the ETH
    function withdrawEther(address to) external onlyOwner {
        require(to != address(0), "Zero recipient");
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool sent, ) = to.call{value: balance}("");
        require(sent, "ETH transfer failed");
    }
}
