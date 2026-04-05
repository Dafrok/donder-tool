import math

def calculate_single_array_difficulty(arr):
    """直接在原始数组上计算节奏难度"""
    
    if len(arr) < 2:
        return 0  # 数组长度小于2，无法计算节奏难度
    
    total_difficulty = 0
    
    for i in range(1, len(arr)):
        ai = arr[i]
        ai_prev = arr[i-1]
        
        # 计算a系数
        if ai == 0 or ai_prev == 0:
            N = 0
        else:
            larger = max(ai, ai_prev)
            smaller = min(ai, ai_prev)
            ratio = larger / smaller
            N = ratio - int(ratio)  # 取小数部分
    
        # 将N赋值为N和1-N中的较小值
        N = min(N, 1 - N)
    
        # 根据N值使用不同的计算公式
        if N < 1/3:
            a_coeff = 2 * math.sqrt(0.25 - (0.5 * (1 - 3 * N)) ** 2)
        else:
            a_coeff = 2 * math.sqrt(0.25 - (0.94 * (1 - 3 * N)) ** 2)
        
        # 计算b系数（大间隔修正系数乘积）
        def get_interval_coeff(value):
            # 阈值参数：上下限分别为30/90 * 1000，30/130 * 1000
            threshold_low = 30/130 * 1000
            threshold_high = 30/90 * 1000
            
            if value <= threshold_low:
                return 1.0
            elif value >= threshold_high:
                return 0.0
            else:
                # 线性插值
                return 1.0 - (value - threshold_low) / (threshold_high - threshold_low)
        
        b_coeff_prev = get_interval_coeff(ai_prev)
        b_coeff_current = get_interval_coeff(ai)
        b_coeff = b_coeff_prev * b_coeff_current
        
        # 计算c系数（馅蜜修正系数）
        def get_filling_coeff(value):
            # 阈值参数：上下限分别为15 / 225 * 1000，15 / 375 * 1000
            upper_threshold = 15 / 225 * 1000
            lower_threshold = 15 / 375 * 1000

            if value >= upper_threshold:
                return 1.0
            elif value <= lower_threshold:
                return 0.0
            else:
                # 线性插值
                return (value - lower_threshold) / (upper_threshold - lower_threshold)
        
        c_coeff = get_filling_coeff(ai)
        
        # 计算节奏难度
        difficulty = a_coeff * b_coeff * c_coeff
        total_difficulty += difficulty
    
    return total_difficulty


def compute_final_rhythm_difficulty(arr):
    """
    简化版的完整节奏难度计算方法（已移除T值相关逻辑）
    
    参数:
    arr: 原始数组 [a0, a1, ..., an]
    
    返回:
    total_difficulty: 节奏难度之和
    difficulty_ratio: 节奏难占比
    """
    # 直接计算节奏难度
    total_difficulty = calculate_single_array_difficulty(arr)
    
    # 计算节奏难占比
    difficulty_ratio = total_difficulty / len(arr) if len(arr) > 0 else 0
    
    return total_difficulty, difficulty_ratio


# 测试函数
def test_simplified_method():
    """测试简化计算方法"""
    
    print("简化版节奏难度计算方法测试（无T值逻辑）")
    print("=" * 60)
    
    # 测试用例
    test_cases = [
        ([100, 200, 150, 300, 250], "中等间隔"),
        ([50, 60, 70, 80, 90], "小间隔"),
        ([400, 500, 600, 700, 800], "大间隔"),
        ([200, 200, 200, 200, 200], "等间隔"),
        ([100, 150, 120, 180, 130], "随机间隔"),
    ]
    
    for arr, description in test_cases:
        print(f"测试数组 ({description}): {arr}")
        difficulty, ratio = compute_final_rhythm_difficulty(arr)
        print(f"  节奏难度之和: {difficulty:.6f}")
        print(f"  节奏难占比: {ratio:.6f}")
        print()


# 系数阈值计算演示
def show_parameters():
    """显示当前使用的参数阈值"""
    
    print("当前参数设置：")
    print("=" * 60)
    
    # 大间隔修正系数阈值
    interval_low = 30/130 * 1000
    interval_high = 30/90 * 1000
    print(f"1. 大间隔修正系数阈值：")
    print(f"   下限: {interval_low:.2f} (30/130 * 1000)")
    print(f"   上限: {interval_high:.2f} (30/90 * 1000)")
    print()
    
    # 馅蜜修正系数阈值
    filling_low = 15/375 * 1000
    filling_high = 15/225 * 1000
    print(f"2. 馅蜜修正系数阈值：")
    print(f"   下限: {filling_low:.2f} (15/375 * 1000)")
    print(f"   上限: {filling_high:.2f} (15/225 * 1000)")
    print()
    
    # 显示不同值对应的系数
    test_values = [0, 50, 100, 150, 200, 250, 300, 400, 500, 1000]
    
    print("大间隔修正系数示例：")
    print("值\t\t系数")
    for val in test_values:
        if val <= interval_low:
            coeff = 1.0
        elif val >= interval_high:
            coeff = 0.0
        else:
            coeff = 1.0 - (val - interval_low) / (interval_high - interval_low)
        print(f"{val}\t\t{coeff:.3f}")
    print()
    
    print("馅蜜修正系数示例：")
    print("值\t\t系数")
    for val in test_values:
        if val >= filling_high:
            coeff = 1.0
        elif val <= filling_low:
            coeff = 0.0
        else:
            coeff = (val - filling_low) / (filling_high - filling_low)
        print(f"{val}\t\t{coeff:.3f}")


def main():
    """主函数"""
    
    print("节奏难度计算程序（无T值逻辑版本）")
    print("=" * 60)
    print()
    
    # 显示参数
    show_parameters()
    print()
    print("=" * 60)
    print()
    
    # 运行测试
    test_simplified_method()
    
    # 交互式测试
    print("=" * 60)
    print("交互式测试")
    print("=" * 60)
    
    while True:
        try:
            user_input = input("\n请输入时间间隔数组（用空格分隔的数字，输入q退出）: ")
            if user_input.lower() == 'q':
                print("程序结束。")
                break
            
            arr = [float(x) for x in user_input.split()]
            if not arr:
                print("请输入有效的数字数组")
                continue
            
            if len(arr) < 2:
                print("数组长度至少为2")
                continue
            
            difficulty, ratio = compute_final_rhythm_difficulty(arr)
            print(f"\n计算结果:")
            print(f"节奏难度之和: {difficulty:.6f}")
            print(f"节奏难占比: {ratio:.6f}")
            
        except ValueError:
            print("输入格式错误，请输入用空格分隔的数字")
        except Exception as e:
            print(f"计算错误: {e}")


if __name__ == "__main__":
    main()