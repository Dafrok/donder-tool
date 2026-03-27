import math

def calculate_rhythm_difficulty(arr, T):
    """
    计算指定T值下的节奏难度和节奏难占比
    
    参数:
    arr: 原始数组 [a0, a1, ..., an]
    T: 阈值参数
    
    返回:
    total_difficulty: 节奏难度之和
    difficulty_ratio: 节奏难占比
    """
    # 首先获取处理后的l和r数组
    def process_array(arr, T):
        a = arr.copy()
        a.append(0)
        n = len(a)
        
        # 标记数组
        marks = [''] * n
        marks[0] = 'R'
        
        for i in range(1, n):
            if marks[i-1] == 'R' and a[i-1] < T:
                marks[i] = 'L'
            else:
                marks[i] = 'R'
        
        def process_with_right_hand(input_array, input_marks):
            # O(n)：L 元素合并到前一个 R 元素
            result = []
            for val, mark in zip(input_array, input_marks):
                if mark == 'L' and result:
                    result[-1] += val
                else:
                    result.append(val)
            return result
        
        def process_with_left_hand(input_array, input_marks):
            # O(n)：R 元素合并到前一个 L 元素，首位 R 直接丢弃
            result = []
            for val, mark in zip(input_array, input_marks):
                if mark == 'R':
                    if result:
                        result[-1] += val
                else:
                    result.append(val)
            return result
        
        result_r = process_with_right_hand(a, marks)
        result_l = process_with_left_hand(a, marks)
        
        return result_r, result_l
    
    # 获取l和r数组
    r_array, l_array = process_array(arr, T)
    
    def calculate_array_difficulty(array):
        """计算单个数组的节奏难度之和"""
        if len(array) < 2:
            return 0  # 数组长度小于2，无法计算节奏难度
        
        total_difficulty = 0
        
        for i in range(1, len(array)):
            ai = array[i]
            ai_prev = array[i-1]
            
            # 计算a系数
            if ai == 0 or ai_prev == 0:
                N = 0
            else:
                larger = max(ai, ai_prev)
                smaller = min(ai, ai_prev)
                ratio = larger / smaller
                N = ratio - int(ratio)  # 取小数部分
        
            # 修改1: 将N赋值为N和1-N中的较小值
            N = min(N, 1 - N)
        
            # 修改2: 根据N值使用不同的计算公式
            if N < 1/3:
                a_coeff = 2 * math.sqrt(0.25 - (0.5 * (1 - 3 * N)) ** 2)
            else:
                a_coeff = 2 * math.sqrt(0.25 - (0.94 * (1 - 3 * N)) ** 2)
            
            # 计算b系数（大间隔修正系数乘积）
            def get_interval_coeff(value):
                threshold_low = 30/130 * 1000 * 1.5
                threshold_high = 30/90 * 1000 * 1.5
                
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
                # 计算阈值
                upper_threshold = 30 / 225 * 1000
                lower_threshold = 30 / 375 * 1000
    
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
    
    # 计算l和r数组的节奏难度
    l_difficulty = calculate_array_difficulty(l_array)
    r_difficulty = calculate_array_difficulty(r_array)
    
    # 计算总节奏难度
    total_difficulty = l_difficulty + r_difficulty
    
    # 计算节奏难占比
    difficulty_ratio = total_difficulty / len(arr) if len(arr) > 0 else 0
    
    return total_difficulty, difficulty_ratio, l_array, r_array


def compute_final_rhythm_difficulty(arr):
    """
    完整的节奏难度计算方法
    
    参数:
    arr: 原始数组 [a0, a1, ..., an]
    
    返回:
    final_difficulty: 最终节奏难度之和
    final_ratio: 最终节奏难占比
    T_used: 使用的T值（如果有加权平均，返回加权结果）
    """
    # 计算阈值
    t_low = 30/260 * 1000
    t_high = 30/180 * 1000
    t0 = t_high
    tm = t_low
    
    candidate_values = sorted(set(v for v in arr if tm < v < t0), reverse=True)
    
    if not candidate_values:
        difficulty, ratio, l_arr, r_arr = calculate_rhythm_difficulty(arr, t0)
        return difficulty, ratio
    
    T_values = [t0] + candidate_values
    
    difficulties = [calculate_rhythm_difficulty(arr, T)[0] for T in T_values]
    
    weights = [1/T_values[i+1] - 1/T_values[i] for i in range(len(T_values) - 1)]
    weights.append(1/tm - 1/T_values[-1])
    
    total_weight = sum(weights)
    
#    if total_weight <= 0:
#        weighted_geometric = difficulties[0]
#    else:
#        weighted_sum_log = 0
#        all_positive = True
#        for i, difficulty in enumerate(difficulties):
#            if difficulty > 0:
#                weighted_sum_log += math.log(difficulty) * weights[i]
#            else:
#                all_positive = False
#                weighted_geometric = 0
#                break
#        if all_positive:
#            weighted_geometric = math.exp(weighted_sum_log / total_weight)
#    
#    final_ratio = weighted_geometric / len(arr) if len(arr) > 0 else 0
#    
#    return weighted_geometric, final_ratio

    if total_weight <= 0:
        weighted_average = difficulties[0]
    else:
        weighted_sum = 0
        for i, difficulty in enumerate(difficulties):
            weighted_sum += difficulty * weights[i]
        weighted_average = weighted_sum / total_weight
    
    final_ratio = weighted_average / len(arr) if len(arr) > 0 else 0
    
    return weighted_average, final_ratio


# 测试函数
def test_complete_method():
    """测试完整的计算方法"""
    
    print("完整节奏难度计算方法测试")
    print("=" * 60)
    
    # 测试1: 没有介于中间的数（所有数都小于等于tm或大于等于t0）
    print("测试1: 没有严格介于(tm, t0)之间的数")
    arr1 = [10, 20, 30, 40, 50]  # 所有数都小于tm=115.38
    print(f"数组: {arr1}")
    result1, ratio1, T_used1, l1, r1 = compute_final_rhythm_difficulty(arr1)
    print(f"最终节奏难度之和: {result1:.6f}")
    print(f"最终节奏难占比: {ratio1:.6f}")
    print(f"使用的T值: {T_used1}")
    print()
    
    # 测试2: 有介于中间的数
    print("测试2: 有严格介于(tm, t0)之间的数")
    arr2 = [100, 120, 140, 160, 180]  # 120,140,160在(115.38, 166.67)之间
    print(f"数组: {arr2}")
    result2, ratio2, T_used2, l2, r2 = compute_final_rhythm_difficulty(arr2)
    print(f"最终节奏难度之和: {result2:.6f}")
    print(f"最终节奏难占比: {ratio2:.6f}")
    print(f"使用的T值: {T_used2}")
    print()
    
    # 测试3: 边界值测试（等于tm或t0的情况）
    print("测试3: 边界值测试")
    arr3 = [115.38, 120, 140, 166.67, 180]  # 115.38和166.67是边界值，不包含在内
    print(f"数组: {arr3}")
    result3, ratio3, T_used3, l3, r3 = compute_final_rhythm_difficulty(arr3)
    print(f"最终节奏难度之和: {result3:.6f}")
    print(f"最终节奏难占比: {ratio3:.6f}")
    print(f"使用的T值: {T_used3}")
    print()
    
    # 测试4: 混合数组
    print("测试4: 混合数组")
    arr4 = [50, 100, 130, 150, 200, 250]
    print(f"数组: {arr4}")
    result4, ratio4, T_used4, l4, r4 = compute_final_rhythm_difficulty(arr4)
    print(f"最终节奏难度之和: {result4:.6f}")
    print(f"最终节奏难占比: {ratio4:.6f}")
    print(f"使用的T值: {T_used4}")
    print()
    
    # 测试5: 复杂数组
    print("测试5: 复杂数组")
    arr5 = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5]
    print(f"数组: {arr5}")
    result5, ratio5, T_used5, l5, r5 = compute_final_rhythm_difficulty(arr5)
    print(f"最终节奏难度之和: {result5:.6f}")
    print(f"最终节奏难占比: {ratio5:.6f}")
    print(f"使用的T值: {T_used5}")
    print()
    
    # 测试6: 重复值测试
    print("测试6: 包含重复值")
    arr6 = [120, 120, 150, 150, 120, 130, 140]
    print(f"数组: {arr6}")
    result6, ratio6, T_used6, l6, r6 = compute_final_rhythm_difficulty(arr6)
    print(f"最终节奏难度之和: {result6:.6f}")
    print(f"最终节奏难占比: {ratio6:.6f}")
    print(f"使用的T值: {T_used6}")


# 验证边界情况
def test_edge_cases():
    """测试边界情况"""
    print("\n" + "=" * 60)
    print("边界情况测试")
    print("=" * 60)
    
    t_low = 30/260 * 1000
    t_high = 30/180 * 1000
    
    # 测试正好等于边界值的情况
    test_cases = [
        ([t_low, t_high], "正好等于边界值"),
        ([t_low - 1, t_low, t_high, t_high + 1], "包含边界值和边界外的值"),
        ([t_low + 1, t_high - 1], "严格在边界内"),
        ([t_low + 0.5, t_high - 0.5], "靠近边界但在内部"),
    ]
    
    for arr, description in test_cases:
        print(f"\n{description}: {arr}")
        candidate_values = []
        for value in arr:
            if t_low < value < t_high:  # 严格大于且严格小于
                candidate_values.append(value)
        
        candidate_values = sorted(list(set(candidate_values)), reverse=True)
        print(f"符合条件的数: {candidate_values}")
        if candidate_values:
            print(f"数量: {len(candidate_values)}个")
        else:
            print("没有符合条件的数")


if __name__ == "__main__":
    # 计算并显示阈值
    t_low = 30/260 * 1000
    t_high = 30/180 * 1000
    print(f"阈值信息:")
    print(f"tm = 30/260 * 1000 = {t_low:.6f}")
    print(f"t0 = 30/180 * 1000 = {t_high:.6f}")
    print(f"开区间范围: ({t_low:.2f}, {t_high:.2f})")
    print()
    
    # 运行边界测试
    test_edge_cases()
    print()
    
    # 运行完整测试
    test_complete_method()
    
    # 交互式测试
    print("\n" + "=" * 60)
    print("交互式测试")
    print("=" * 60)
    
    while True:
        try:
            user_input = input("\n请输入数组（用空格分隔的数字，输入q退出）: ")
            if user_input.lower() == 'q':
                break
            
            arr = [float(x) for x in user_input.split()]
            if not arr:
                print("请输入有效的数字数组")
                continue
            
            result, ratio, T_used, l_arr, r_arr = compute_final_rhythm_difficulty(arr)
            print(f"\n计算结果:")
            print(f"最终节奏难度之和: {result:.6f}")
            print(f"最终节奏难占比: {ratio:.6f}")
            
        except ValueError:
            print("输入格式错误，请输入用空格分隔的数字")
        except Exception as e:
            print(f"计算错误: {e}")
